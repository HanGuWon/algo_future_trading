import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { BacktestEngine } from "../backtest/engine.js";
import { OfficialCalendarProvider } from "../calendars/officialCalendarProvider.js";
import {
  CALENDAR_SEED_PATH,
  DEFAULT_ACCOUNT_EQUITY_USD,
  DEFAULT_ARTIFACTS_DIR,
  DEFAULT_DB_PATH,
  DEFAULT_STRATEGY_CONFIG,
  DEFAULT_WALKFORWARD_DAYS,
  MNQ_SPEC
} from "../config/defaults.js";
import { aggregateBars, parseCsvBars } from "../data/barAggregation.js";
import { summarizeMetrics } from "../reporting/metrics.js";
import { WalkForwardRunner } from "../research/walkforward.js";
import { SqliteStore } from "../storage/sqliteStore.js";

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

async function ingestCommand(options: Map<string, string>): Promise<void> {
  const file = options.get("file");
  if (!file) {
    throw new Error("ingest requires --file <csv>");
  }
  const dbPath = options.get("db") ?? DEFAULT_DB_PATH;
  const symbol = options.get("symbol") ?? "MNQ";
  const raw = await readFile(file, "utf8");
  const bars1m = parseCsvBars(raw, symbol);
  const store = new SqliteStore(dbPath);
  try {
    store.insertBars("1m", bars1m);
    store.insertBars("5m", aggregateBars(bars1m, "5m"));
    store.insertBars("15m", aggregateBars(bars1m, "15m"));
    store.insertBars("1h", aggregateBars(bars1m, "1h"));
  } finally {
    store.close();
  }
  console.log(`Ingested ${bars1m.length} raw 1m bars into ${dbPath}`);
}

async function syncCalendarsCommand(options: Map<string, string>): Promise<void> {
  const outputPath = options.get("out") ?? CALENDAR_SEED_PATH;
  await mkdir(dirname(outputPath), { recursive: true });
  const provider = new OfficialCalendarProvider(DEFAULT_STRATEGY_CONFIG);
  const windows = await provider.syncToFile(outputPath);
  if (options.get("db")) {
    const store = new SqliteStore(options.get("db")!);
    try {
      store.insertEventWindows(windows);
    } finally {
      store.close();
    }
  }
  console.log(`Synced ${windows.length} official event windows to ${outputPath}`);
}

async function backtestCommand(options: Map<string, string>, paperMode = false): Promise<void> {
  const dbPath = options.get("db") ?? DEFAULT_DB_PATH;
  const store = new SqliteStore(dbPath);
  try {
    const start = options.get("start");
    const end = options.get("end");
    const bars1m = store.getBars("MNQ", "1m", start, end);
    if (bars1m.length === 0) {
      throw new Error(`No 1m MNQ bars found in ${dbPath}. Run ingest first.`);
    }
    const eventWindows = store.getEventWindows(start, end);
    const engine = new BacktestEngine(DEFAULT_STRATEGY_CONFIG, MNQ_SPEC, DEFAULT_ACCOUNT_EQUITY_USD);
    const result = engine.run(bars1m, eventWindows);
    store.insertTrades(result.trades);
    const grossPnl = result.trades.reduce((sum, trade) => sum + trade.pnlUsd, 0);
    const wins = result.trades.filter((trade) => trade.pnlUsd > 0).length;
    const winRate = result.trades.length > 0 ? (wins / result.trades.length) * 100 : 0;
    console.log(`${paperMode ? "Paper" : "Backtest"} complete`);
    console.log(`Trades: ${result.trades.length}`);
    console.log(`Rejected signals: ${result.rejectedSignals.length}`);
    console.log(`Win rate: ${winRate.toFixed(2)}%`);
    console.log(`Net PnL: ${grossPnl.toFixed(2)} USD`);
    console.log(`Final equity: ${result.finalAccountState.equityUsd.toFixed(2)} USD`);
  } finally {
    store.close();
  }
}

async function walkforwardCommand(options: Map<string, string>, logger: Pick<Console, "log"> = console): Promise<void> {
  const dbPath = options.get("db") ?? DEFAULT_DB_PATH;
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
    const runner = new WalkForwardRunner(bars1m, eventWindows, {
      mode,
      startUtc: start,
      endUtc: end,
      trainDays: getNumberOption(options, "train-days", DEFAULT_WALKFORWARD_DAYS.trainDays),
      validationDays: getNumberOption(options, "validation-days", DEFAULT_WALKFORWARD_DAYS.validationDays),
      testDays: getNumberOption(options, "test-days", DEFAULT_WALKFORWARD_DAYS.testDays),
      stepDays: getNumberOption(options, "step-days", DEFAULT_WALKFORWARD_DAYS.stepDays)
    });
    const artifact = runner.run();
    const artifactsDir = options.get("artifacts-dir") ?? DEFAULT_ARTIFACTS_DIR;
    const artifactPath = await runner.writeArtifact(artifact, artifactsDir);

    logger.log(`Walk-forward complete (${artifact.mode})`);
    logger.log(`Windows: ${artifact.windows.length}`);
    logger.log(`Selected windows: ${artifact.windows.filter((window) => window.status === "selected").length}`);
    for (const line of summarizeMetrics(artifact.rolledUpMetrics)) {
      logger.log(line);
    }
    logger.log(`Artifact: ${artifactPath}`);
  } finally {
    store.close();
  }
}

export async function runCli(argv: string[], logger: Pick<Console, "log"> = console): Promise<void> {
  const [command = "help", ...rest] = argv;
  const options = parseArgs(rest);
  switch (command) {
    case "ingest":
      await ingestCommand(options);
      return;
    case "sync-calendars":
      await syncCalendarsCommand(options);
      return;
    case "backtest":
      await backtestCommand(options, false);
      return;
    case "walkforward":
      await walkforwardCommand(options, logger);
      return;
    case "paper":
      await backtestCommand(options, true);
      return;
    default:
      logger.log("Commands: ingest, sync-calendars, backtest, walkforward, paper");
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
