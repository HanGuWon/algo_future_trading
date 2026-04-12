import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { BacktestEngine } from "../backtest/engine.js";
import { OfficialCalendarProvider } from "../calendars/officialCalendarProvider.js";
import {
  ACCEPTANCE_SPLIT,
  CALENDAR_SEED_PATH,
  DEFAULT_ACCOUNT_EQUITY_USD,
  DEFAULT_ARTIFACTS_DIR,
  DEFAULT_DB_PATH,
  DEFAULT_STRATEGY_CONFIG_PATH,
  DEFAULT_WALKFORWARD_DAYS,
  MNQ_SPEC
} from "../config/defaults.js";
import { describeStrategyConfig, loadStrategyConfig } from "../config/strategyLoader.js";
import { aggregateBars, parseCsvBarsDetailed } from "../data/barAggregation.js";
import { PaperEngine } from "../paper/paperEngine.js";
import { writeBatchArtifact } from "../reporting/batchArtifacts.js";
import { writeArtifactIndex } from "../reporting/artifactIndex.js";
import { writePaperArtifact } from "../reporting/paperArtifacts.js";
import { writeResearchArtifact } from "../reporting/researchArtifacts.js";
import { writeWalkForwardArtifacts } from "../reporting/walkforwardArtifacts.js";
import {
  buildDailyPerformanceRows,
  buildSessionPerformanceRows,
  computeRunMetrics,
  summarizeMetrics,
  summarizePerformanceRows
} from "../reporting/metrics.js";
import { ResearchReportRunner } from "../research/report.js";
import { WalkForwardRunner } from "../research/walkforward.js";
import { SqliteStore } from "../storage/sqliteStore.js";
import { buildRunProvenance } from "../utils/runProvenance.js";
import type { ArtifactKind, ArtifactSortBy } from "../reporting/artifactIndex.js";
import type {
  BatchRunArtifact,
  BatchStepResult,
  DateRange,
  PaperReportArtifact,
  ResearchReportArtifact,
  RunProvenance,
  WalkForwardArtifact
} from "../types.js";

export function parseArgs(argv: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    options.set(key, value);
    if (value !== "true") {
      index += 1;
    }
  }
  return options;
}

function getNumberOption(options: Map<string, string>, key: string, fallback: number): number {
  const raw = options.get(key);
  return raw === undefined ? fallback : Number(raw);
}

async function loadCliStrategyContext(
  options: Map<string, string>
): Promise<{
  configPath: string;
  config: Awaited<ReturnType<typeof loadStrategyConfig>>["config"];
  reference: Awaited<ReturnType<typeof loadStrategyConfig>>["reference"];
}> {
  const configPath = options.get("config") ?? DEFAULT_STRATEGY_CONFIG_PATH;
  const loaded = await loadStrategyConfig(configPath);
  return {
    configPath: loaded.resolvedPath,
    config: loaded.config,
    reference: loaded.reference
  };
}

interface IngestCommandResult {
  rowCount: number;
  range: DateRange;
  contracts: string[];
  warnings: string[];
  dbPath: string;
}

interface SyncCalendarsCommandResult {
  outputPath: string;
  windowsCount: number;
}

interface PaperCommandResult {
  artifact: PaperReportArtifact;
  artifactPaths: { jsonPath: string; markdownPath: string };
}

interface WalkForwardCommandResult {
  artifact: WalkForwardArtifact;
  artifactPaths: { jsonPath: string; markdownPath: string };
}

interface ResearchCommandResult {
  artifact: ResearchReportArtifact;
  artifactPaths: { jsonPath: string; markdownPath: string };
}

interface ArtifactsCommandResult {
  jsonPath: string;
  markdownPath: string;
  index: Awaited<ReturnType<typeof writeArtifactIndex>>["index"];
}

function rangeFromOptionalBounds(startUtc?: string | null, endUtc?: string | null): DateRange | null {
  if (!startUtc || !endUtc) {
    return null;
  }
  return { startUtc, endUtc };
}

async function ingestCommand(
  options: Map<string, string>,
  logger: Pick<Console, "log"> = console
): Promise<IngestCommandResult> {
  const file = options.get("file");
  if (!file) {
    throw new Error("ingest requires --file <csv>");
  }
  const dbPath = options.get("db") ?? DEFAULT_DB_PATH;
  const symbol = options.get("symbol") ?? "MNQ";
  const contractFallback = options.get("contract") ?? "UNKNOWN";
  const raw = await readFile(file, "utf8");
  const parsed = parseCsvBarsDetailed(raw, symbol, contractFallback);
  const bars1m = parsed.bars;
  const store = new SqliteStore(dbPath);
  try {
    store.insertBars("1m", bars1m);
    store.insertBars("5m", aggregateBars(bars1m, "5m"));
    store.insertBars("15m", aggregateBars(bars1m, "15m"));
    store.insertBars("1h", aggregateBars(bars1m, "1h"));
  } finally {
    store.close();
  }
  logger.log(`Ingested ${bars1m.length} raw 1m bars into ${dbPath}`);
  logger.log(`Range: ${parsed.summary.firstTsUtc} -> ${parsed.summary.lastTsUtc}`);
  logger.log(`Contracts: ${parsed.summary.contracts.join(", ")}`);
  if (parsed.summary.usedFallbackContract) {
    logger.log(`Fallback contract in use: ${contractFallback}`);
  }
  for (const warning of parsed.warnings) {
    logger.log(`Warning: ${warning}`);
  }
  return {
    rowCount: bars1m.length,
    range: {
      startUtc: parsed.summary.firstTsUtc,
      endUtc: parsed.summary.lastTsUtc
    },
    contracts: parsed.summary.contracts,
    warnings: parsed.warnings,
    dbPath
  };
}

async function syncCalendarsCommand(
  options: Map<string, string>,
  logger: Pick<Console, "log"> = console
): Promise<SyncCalendarsCommandResult> {
  const outputPath = options.get("out") ?? CALENDAR_SEED_PATH;
  const strategy = await loadCliStrategyContext(options);
  await mkdir(dirname(outputPath), { recursive: true });
  const provider = new OfficialCalendarProvider(strategy.config);
  const windows = await provider.syncToFile(outputPath);
  if (options.get("db")) {
    const store = new SqliteStore(options.get("db")!);
    try {
      store.insertEventWindows(windows);
    } finally {
      store.close();
    }
  }
  logger.log(`Config: ${strategy.configPath}`);
  logger.log(`Strategy params: ${describeStrategyConfig(strategy.config)}`);
  logger.log(`Synced ${windows.length} official event windows to ${outputPath}`);
  return {
    outputPath,
    windowsCount: windows.length
  };
}

async function backtestCommand(
  options: Map<string, string>,
  logger: Pick<Console, "log"> = console
): Promise<void> {
  const dbPath = options.get("db") ?? DEFAULT_DB_PATH;
  const strategy = await loadCliStrategyContext(options);
  const store = new SqliteStore(dbPath);
  try {
    const start = options.get("start");
    const end = options.get("end");
    const bars1m = store.getBars("MNQ", "1m", start, end);
    if (bars1m.length === 0) {
      throw new Error(`No 1m MNQ bars found in ${dbPath}. Run ingest first.`);
    }
    const eventWindows = store.getEventWindows(start, end);
    const engine = new BacktestEngine(strategy.config, MNQ_SPEC, DEFAULT_ACCOUNT_EQUITY_USD);
    const result = engine.run(bars1m, eventWindows);
    store.insertTrades(result.trades, "BACKTEST");
    const grossPnl = result.trades.reduce((sum, trade) => sum + trade.pnlUsd, 0);
    const wins = result.trades.filter((trade) => trade.pnlUsd > 0).length;
    const winRate = result.trades.length > 0 ? (wins / result.trades.length) * 100 : 0;
    logger.log("Backtest complete");
    logger.log(`Config: ${strategy.configPath}`);
    logger.log(`Strategy params: ${describeStrategyConfig(strategy.config)}`);
    logger.log(`Trades: ${result.trades.length}`);
    logger.log(`Rejected signals: ${result.rejectedSignals.length}`);
    logger.log(`Win rate: ${winRate.toFixed(2)}%`);
    logger.log(`Net PnL: ${grossPnl.toFixed(2)} USD`);
    logger.log(`Final equity: ${result.finalAccountState.equityUsd.toFixed(2)} USD`);
  } finally {
    store.close();
  }
}

async function paperCommand(
  options: Map<string, string>,
  logger: Pick<Console, "log"> = console
): Promise<PaperCommandResult> {
  const dbPath = options.get("db") ?? DEFAULT_DB_PATH;
  const strategy = await loadCliStrategyContext(options);
  const store = new SqliteStore(dbPath);
  try {
    const start = options.get("start") ?? ACCEPTANCE_SPLIT.paperStart;
    const end = options.get("end");
    const bars1m = store.getBars("MNQ", "1m", start, end);
    if (bars1m.length === 0) {
      throw new Error(`No 1m MNQ bars found in ${dbPath} for paper mode. Run ingest first.`);
    }
    const eventWindows = store.getEventWindows(start, end);
    const priorState = store.getPaperState(strategy.config.strategyId, MNQ_SPEC.symbol);
    const engine = new PaperEngine(
      strategy.config,
      MNQ_SPEC,
      DEFAULT_ACCOUNT_EQUITY_USD,
      priorState?.paperStartUtc ?? start
    );
    const result = engine.run(bars1m, eventWindows, priorState);
    store.insertTrades(result.trades, "PAPER");
    store.upsertPaperState(result.finalState);
    const cumulativeTrades = store.getTrades({
      strategyId: strategy.config.strategyId,
      symbol: MNQ_SPEC.symbol,
      source: "PAPER",
      startUtc: result.finalState.paperStartUtc,
      endUtc: result.finalState.processedThroughUtc ?? undefined
    });
    const runMetrics = computeRunMetrics({
      trades: result.trades,
      rejectedSignals: result.rejectedSignals
    });
    const cumulativeMetrics = computeRunMetrics({
      trades: cumulativeTrades,
      rejectedSignals: []
    });
    const dailyPerformance = buildDailyPerformanceRows(cumulativeTrades);
    const sessionPerformance = buildSessionPerformanceRows(cumulativeTrades);
    const artifactsDir = options.get("artifacts-dir") ?? DEFAULT_ARTIFACTS_DIR;
    const artifact: PaperReportArtifact = {
      generatedAtUtc: new Date().toISOString(),
      symbol: MNQ_SPEC.symbol,
      strategyId: strategy.config.strategyId,
      config: strategy.reference,
      runProvenance: buildRunProvenance({
        dbPath,
        eventWindowCount: eventWindows.length,
        bars: bars1m
      }),
      source: "PAPER",
      run: {
        startUtc: priorState?.processedThroughUtc ?? result.finalState.paperStartUtc,
        endUtc: end ?? null,
        processedThroughUtc: result.finalState.processedThroughUtc,
        newTradeCount: result.trades.length,
        rejectedSignalCount: result.rejectedSignals.length,
        artifactVersion: "0.1.0"
      },
      activePosition: result.finalState.activePosition,
      runMetrics,
      cumulativeMetrics,
      dailyPerformance,
      sessionPerformance
    };
    const artifactPaths = await writePaperArtifact(
      artifact,
      artifactsDir
    );

    logger.log("Paper run complete");
    logger.log(`Config: ${strategy.configPath}`);
    logger.log(`Strategy params: ${describeStrategyConfig(strategy.config)}`);
    logger.log(`New trades: ${runMetrics.tradeCount}`);
    logger.log(`Rejected signals: ${runMetrics.rejectedSignalCount}`);
    logger.log(`Final equity: ${result.finalState.accountState.equityUsd.toFixed(2)} USD`);
    logger.log(`Processed through: ${result.finalState.processedThroughUtc ?? "n/a"}`);
    for (const line of summarizeMetrics(cumulativeMetrics)) {
      logger.log(`Cumulative ${line}`);
    }
    for (const line of summarizePerformanceRows(dailyPerformance, sessionPerformance)) {
      logger.log(line);
    }
    if (result.finalState.activePosition) {
      logger.log(
        `Active position: ${result.finalState.activePosition.status} ${result.finalState.activePosition.side} ${result.finalState.activePosition.remainingQty} @ ${result.finalState.activePosition.entryPx.toFixed(2)}`
      );
    } else {
      logger.log("Active position: none");
    }
    logger.log(`Artifact JSON: ${artifactPaths.jsonPath}`);
    logger.log(`Artifact Markdown: ${artifactPaths.markdownPath}`);
    return {
      artifact,
      artifactPaths
    };
  } finally {
    store.close();
  }
}

async function walkforwardCommand(
  options: Map<string, string>,
  logger: Pick<Console, "log"> = console
): Promise<WalkForwardCommandResult> {
  const dbPath = options.get("db") ?? DEFAULT_DB_PATH;
  const strategy = await loadCliStrategyContext(options);
  const store = new SqliteStore(dbPath);
  try {
    const start = options.get("start");
    const end = options.get("end");
    const bars1m = store.getBars("MNQ", "1m", start, end);
    if (bars1m.length === 0) {
      throw new Error(`No 1m MNQ bars found in ${dbPath}. Run ingest first.`);
    }
    const eventWindows = store.getEventWindows(start, end);
    const mode = options.get("mode") === "fixed" ? "fixed" : "grid";
    const runner = new WalkForwardRunner(
      bars1m,
      eventWindows,
      {
        mode,
        startUtc: start,
        endUtc: end,
        trainDays: getNumberOption(options, "train-days", DEFAULT_WALKFORWARD_DAYS.trainDays),
        validationDays: getNumberOption(options, "validation-days", DEFAULT_WALKFORWARD_DAYS.validationDays),
        testDays: getNumberOption(options, "test-days", DEFAULT_WALKFORWARD_DAYS.testDays),
        stepDays: getNumberOption(options, "step-days", DEFAULT_WALKFORWARD_DAYS.stepDays)
      },
      undefined,
      strategy.config,
      dbPath
    );
    const artifact = runner.run();
    artifact.config = strategy.reference;
    const artifactsDir = options.get("artifacts-dir") ?? DEFAULT_ARTIFACTS_DIR;
    const artifactPaths = await writeWalkForwardArtifacts(artifact, artifactsDir);

    logger.log(`Walk-forward complete (${artifact.mode})`);
    logger.log(`Config: ${strategy.configPath}`);
    logger.log(`Strategy params: ${describeStrategyConfig(strategy.config)}`);
    logger.log(`Windows: ${artifact.windows.length}`);
    logger.log(`Selected windows: ${artifact.windows.filter((window) => window.status === "selected").length}`);
    for (const line of summarizeMetrics(artifact.rolledUpMetrics)) {
      logger.log(line);
    }
    logger.log(`Artifact JSON: ${artifactPaths.jsonPath}`);
    logger.log(`Artifact Markdown: ${artifactPaths.markdownPath}`);
    return {
      artifact,
      artifactPaths
    };
  } finally {
    store.close();
  }
}

async function researchCommand(
  options: Map<string, string>,
  logger: Pick<Console, "log"> = console
): Promise<ResearchCommandResult> {
  const dbPath = options.get("db") ?? DEFAULT_DB_PATH;
  const strategy = await loadCliStrategyContext(options);
  const store = new SqliteStore(dbPath);
  try {
    const bars1m = store.getBars("MNQ", "1m", ACCEPTANCE_SPLIT.trainStart, ACCEPTANCE_SPLIT.testEnd);
    if (bars1m.length === 0) {
      throw new Error(`No 1m MNQ bars found in ${dbPath} for research mode. Run ingest first.`);
    }
    const eventWindows = store.getEventWindows(ACCEPTANCE_SPLIT.trainStart, ACCEPTANCE_SPLIT.testEnd);
    const runner = new ResearchReportRunner(bars1m, eventWindows, {
      baseConfig: strategy.config,
      dbPath
    });
    const artifact = runner.run();
    artifact.config = strategy.reference;
    const artifactsDir = options.get("artifacts-dir") ?? DEFAULT_ARTIFACTS_DIR;
    const artifactPaths = await writeResearchArtifact(artifact, artifactsDir);

    logger.log("Research report complete");
    logger.log(`Config: ${strategy.configPath}`);
    logger.log(`Strategy params: ${describeStrategyConfig(strategy.config)}`);
    logger.log(`Baseline acceptance: test expectancy ${artifact.baseline.test.metrics.expectancyUsd.toFixed(2)} USD`);
    logger.log(
      `Walk-forward OOS: ${artifact.walkforward.selectedWindowCount}/${artifact.walkforward.windowCount} windows selected`
    );
    logger.log(
      `Parameter stability: ${artifact.sensitivity.stableCandidateCount}/${artifact.sensitivity.totalCandidates} stable candidates`
    );
    const defaultEventScenario = artifact.eventComparison.scenarios.find((scenario) => scenario.scenario === "default");
    logger.log(
      `Event-filter comparison: default expectancy ${defaultEventScenario?.metrics.expectancyUsd.toFixed(2) ?? "0.00"} USD`
    );
    logger.log(`Recommendation: ${artifact.finalAssessment.recommendation}`);
    logger.log(`Artifact JSON: ${artifactPaths.jsonPath}`);
    logger.log(`Artifact Markdown: ${artifactPaths.markdownPath}`);
    return {
      artifact,
      artifactPaths
    };
  } finally {
    store.close();
  }
}

async function artifactsCommand(
  options: Map<string, string>,
  logger: Pick<Console, "log"> = console
): Promise<ArtifactsCommandResult> {
  const artifactsDir = options.get("artifacts-dir") ?? DEFAULT_ARTIFACTS_DIR;
  const configHash = options.get("config-hash") ?? null;
  const gatePassOnly = options.get("gate-pass-only") === "true";
  const rawSortBy = options.get("sort-by");
  let sortBy: ArtifactSortBy = "generated_at";
  if (rawSortBy !== undefined) {
    if (rawSortBy !== "generated_at" && rawSortBy !== "net_pnl" && rawSortBy !== "expectancy") {
      throw new Error("artifacts --sort-by must be one of: generated_at, net_pnl, expectancy");
    }
    sortBy = rawSortBy;
  }
  const latestOnly = options.get("latest-only") === "true";
  const rawLimit = options.get("limit");
  let limit: number | null = null;
  if (rawLimit !== undefined) {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 0) {
      throw new Error("artifacts --limit must be a non-negative integer");
    }
    limit = parsedLimit;
  }
  const rawKind = options.get("kind");
  const kind =
    rawKind === "paper" || rawKind === "research" || rawKind === "walkforward"
      ? (rawKind as ArtifactKind)
      : null;
  if (rawKind && !kind) {
    throw new Error("artifacts --kind must be one of: paper, research, walkforward");
  }
  const result = await writeArtifactIndex(artifactsDir, configHash, kind, gatePassOnly, sortBy, latestOnly, limit);
  logger.log("Artifact index complete");
  logger.log(`Config hash filter: ${configHash ?? "none"}`);
  logger.log(`Kind filter: ${kind ?? "none"}`);
  logger.log(`Gate pass only: ${gatePassOnly ? "yes" : "no"}`);
  logger.log(`Sort by: ${sortBy}`);
  logger.log(`Latest only: ${latestOnly ? "yes" : "no"}`);
  logger.log(`Limit: ${limit ?? "none"}`);
  logger.log(`Paper reports: ${result.index.counts.paper}`);
  logger.log(`Research reports: ${result.index.counts.research}`);
  logger.log(`Walk-forward reports: ${result.index.counts.walkforward}`);
  logger.log(`Config profiles shown: ${result.index.byConfigHash.length}`);
  logger.log(`Config profiles total: ${result.index.totalConfigProfiles}`);
  if (result.index.latest.paper) {
    logger.log(`Latest paper: ${result.index.latest.paper.headline}`);
  }
  if (result.index.latest.research) {
    logger.log(`Latest research: ${result.index.latest.research.headline}`);
  }
  if (result.index.latest.walkforward) {
    logger.log(`Latest walk-forward: ${result.index.latest.walkforward.headline}`);
  }
  if (result.index.byConfigHash[0]) {
    logger.log(`Top config group: ${result.index.byConfigHash[0].summary} (${result.index.byConfigHash[0].sha256.slice(0, 12)})`);
  }
  logger.log(`Index JSON: ${result.jsonPath}`);
  logger.log(`Index Markdown: ${result.markdownPath}`);
  return result;
}

async function batchCommand(options: Map<string, string>, logger: Pick<Console, "log"> = console): Promise<void> {
  const dbPath = options.get("db") ?? DEFAULT_DB_PATH;
  const artifactsDir = options.get("artifacts-dir") ?? DEFAULT_ARTIFACTS_DIR;
  const strategy = await loadCliStrategyContext(options);
  const steps: BatchStepResult[] = [];
  const batchStartedAtUtc = new Date().toISOString();
  let failedStep: BatchStepResult["step"] | null = null;
  let finalStatus: BatchRunArtifact["status"] = "completed";
  let batchProvenance: RunProvenance = buildRunProvenance({
    dbPath,
    eventWindowCount: 0,
    sourceRange: rangeFromOptionalBounds(options.get("start"), options.get("end"))
  });

  async function runBatchStep(
    step: BatchStepResult["step"],
    executor: () => Promise<{ artifactPaths?: string[]; provenance?: RunProvenance; message?: string }>
  ): Promise<void> {
    const startedAtUtc = new Date().toISOString();
    try {
      const result = await executor();
      steps.push({
        step,
        status: "completed",
        startedAtUtc,
        completedAtUtc: new Date().toISOString(),
        message: result.message ?? "completed",
        artifactPaths: result.artifactPaths
      });
      if (result.provenance) {
        batchProvenance = result.provenance;
      }
    } catch (error) {
      failedStep = step;
      finalStatus = "failed";
      steps.push({
        step,
        status: "failed",
        startedAtUtc,
        completedAtUtc: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  try {
    await runBatchStep("sync-calendars", async () => {
      const result = await syncCalendarsCommand(options, logger);
      return {
        message: `synced ${result.windowsCount} windows`,
        provenance: buildRunProvenance({
          dbPath,
          eventWindowCount: result.windowsCount,
          sourceRange: rangeFromOptionalBounds(options.get("start"), options.get("end"))
        })
      };
    });

    if (options.get("file")) {
      await runBatchStep("ingest", async () => {
        const result = await ingestCommand(options, logger);
        return {
          message: `ingested ${result.rowCount} bars`,
          provenance: buildRunProvenance({
            dbPath,
            eventWindowCount: batchProvenance.eventWindowCount,
            sourceRange: result.range
          })
        };
      });
    } else {
      steps.push({
        step: "ingest",
        status: "skipped",
        startedAtUtc: new Date().toISOString(),
        completedAtUtc: new Date().toISOString(),
        message: "no --file provided"
      });
    }

    await runBatchStep("paper", async () => {
      const result = await paperCommand(options, logger);
      return {
        artifactPaths: [result.artifactPaths.jsonPath, result.artifactPaths.markdownPath],
        provenance: result.artifact.runProvenance,
        message: `paper trades ${result.artifact.run.newTradeCount}`
      };
    });

    await runBatchStep("research", async () => {
      const result = await researchCommand(options, logger);
      return {
        artifactPaths: [result.artifactPaths.jsonPath, result.artifactPaths.markdownPath],
        provenance: result.artifact.runProvenance,
        message: `recommendation ${result.artifact.finalAssessment.recommendation}`
      };
    });

    await runBatchStep("artifacts", async () => {
      const result = await artifactsCommand(options, logger);
      return {
        artifactPaths: [result.jsonPath, result.markdownPath],
        provenance: batchProvenance,
        message: `config profiles ${result.index.totalConfigProfiles}`
      };
    });
  } catch {
    // Preserve failure state and write the batch artifact below.
  }

  const batchArtifact: BatchRunArtifact = {
    generatedAtUtc: batchStartedAtUtc,
    completedAtUtc: new Date().toISOString(),
    status: finalStatus,
    failedStep,
    strategyId: strategy.config.strategyId,
    config: strategy.reference,
    runProvenance: batchProvenance,
    steps
  };
  const batchArtifactPath = await writeBatchArtifact(batchArtifact, artifactsDir);

  logger.log(`Batch status: ${batchArtifact.status}`);
  logger.log(`Batch failed step: ${batchArtifact.failedStep ?? "none"}`);
  logger.log(`Batch artifact JSON: ${batchArtifactPath.jsonPath}`);

  if (failedStep !== null) {
    throw new Error(`batch failed at step ${failedStep}`);
  }
}

export async function runCli(argv: string[], logger: Pick<Console, "log"> = console): Promise<void> {
  const [command = "help", ...rest] = argv;
  const options = parseArgs(rest);
  switch (command) {
    case "ingest":
      await ingestCommand(options, logger);
      return;
    case "sync-calendars":
      await syncCalendarsCommand(options, logger);
      return;
    case "backtest":
      await backtestCommand(options, logger);
      return;
    case "walkforward":
      await walkforwardCommand(options, logger);
      return;
    case "artifacts":
      await artifactsCommand(options, logger);
      return;
    case "research":
      await researchCommand(options, logger);
      return;
    case "paper":
      await paperCommand(options, logger);
      return;
    case "batch":
      await batchCommand(options, logger);
      return;
    default:
      logger.log("Commands: ingest, sync-calendars, backtest, walkforward, artifacts, research, paper, batch");
      logger.log('ingest options: --file <csv> [--db path] [--symbol MNQ] [--contract H26]');
      logger.log('artifacts options: [--artifacts-dir path] [--config-hash prefix] [--kind paper|research|walkforward] [--gate-pass-only] [--sort-by generated_at|net_pnl|expectancy] [--latest-only] [--limit N]');
      logger.log('batch options: [--db path] [--config path] [--artifacts-dir path] [--file csv] [--contract H26] [--start iso] [--end iso]');
      logger.log(`strategy options: [--config ${DEFAULT_STRATEGY_CONFIG_PATH}]`);
  }
}

async function main(): Promise<void> {
  await runCli(process.argv.slice(2), console);
}

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
