import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BacktestEngine } from "../backtest/engine.js";
import { DEFAULT_ARTIFACTS_DIR, DEFAULT_STRATEGY_CONFIG, MNQ_SPEC } from "../config/defaults.js";
import { buildFixedCandidate, buildSmallParameterGrid } from "./parameterGrid.js";
import { combineMetrics, computeRunMetrics, mergeBacktestResults } from "../reporting/metrics.js";
import { buildRunProvenance } from "../utils/runProvenance.js";
import type {
  BacktestResult,
  Bar,
  CandidateEvaluation,
  DateRange,
  EventWindow,
  ParameterCandidate,
  InputMode,
  RunMetrics,
  StrategyConfig,
  WalkForwardArtifact,
  WalkForwardRunOptions,
  WalkForwardWindow,
  WindowSelectionResult
} from "../types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildWalkForwardWindows(range: DateRange, options: WalkForwardRunOptions): WalkForwardWindow[] {
  const windows: WalkForwardWindow[] = [];
  let cursor = new Date(range.startUtc).getTime();
  const end = new Date(range.endUtc).getTime();
  let index = 0;

  while (true) {
    const trainStart = cursor;
    const trainEnd = trainStart + options.trainDays * DAY_MS - 1;
    const validationStart = trainEnd + 1;
    const validationEnd = validationStart + options.validationDays * DAY_MS - 1;
    const testStart = validationEnd + 1;
    const testEnd = testStart + options.testDays * DAY_MS - 1;
    if (testEnd > end) {
      break;
    }

    windows.push({
      id: `wf_${String(index + 1).padStart(3, "0")}`,
      train: toRange(trainStart, trainEnd),
      validation: toRange(validationStart, validationEnd),
      test: toRange(testStart, testEnd)
    });

    cursor += options.stepDays * DAY_MS;
    index += 1;
  }

  return windows;
}

function toRange(startMs: number, endMs: number): DateRange {
  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString()
  };
}

function filterBarsByRange(bars: Bar[], range: DateRange): Bar[] {
  return bars.filter((bar) => bar.tsUtc >= range.startUtc && bar.tsUtc <= range.endUtc);
}

function filterEventsByRange(windows: EventWindow[], range: DateRange): EventWindow[] {
  return windows.filter((window) => window.endUtc >= range.startUtc && window.startUtc <= range.endUtc);
}

function evaluateCandidate(candidate: ParameterCandidate, bars: Bar[], events: EventWindow[], range: DateRange): BacktestResult {
  const engine = new BacktestEngine(candidate.config, MNQ_SPEC, 25_000);
  return engine.run(filterBarsByRange(bars, range), filterEventsByRange(events, range));
}

export function rankCandidate(metrics: RunMetrics): { eligible: boolean; score: string } {
  const eligible = metrics.tradeCount > 0 && metrics.expectancyUsd > 0;
  const components = [
    eligible ? 1 : 0,
    -metrics.maxDrawdownUsd,
    metrics.netPnlUsd,
    metrics.tradeCount
  ];
  return {
    eligible,
    score: components.map((value) => value.toFixed(6)).join("|")
  };
}

export function selectBestCandidate(evaluations: CandidateEvaluation[]): CandidateEvaluation | null {
  const eligible = evaluations.filter((item) => item.isEligible);
  if (eligible.length === 0) {
    return null;
  }

  return [...eligible].sort(compareCandidateEvaluations)[0] ?? null;
}

function compareCandidateEvaluations(left: CandidateEvaluation, right: CandidateEvaluation): number {
  if (left.inSampleMetrics.maxDrawdownUsd !== right.inSampleMetrics.maxDrawdownUsd) {
    return left.inSampleMetrics.maxDrawdownUsd - right.inSampleMetrics.maxDrawdownUsd;
  }
  if (left.inSampleMetrics.netPnlUsd !== right.inSampleMetrics.netPnlUsd) {
    return right.inSampleMetrics.netPnlUsd - left.inSampleMetrics.netPnlUsd;
  }
  if (left.inSampleMetrics.tradeCount !== right.inSampleMetrics.tradeCount) {
    return right.inSampleMetrics.tradeCount - left.inSampleMetrics.tradeCount;
  }
  return left.candidate.id.localeCompare(right.candidate.id);
}

function getRangeMs(range: DateRange): number {
  return new Date(range.endUtc).getTime() - new Date(range.startUtc).getTime();
}

export class WalkForwardRunner {
  constructor(
    private readonly bars: Bar[],
    private readonly eventWindows: EventWindow[],
    private readonly options: WalkForwardRunOptions,
    private readonly candidatesOverride?: ParameterCandidate[],
    private readonly baseConfig: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    private readonly dbPath: string | null = null,
    private readonly gitCommitSha?: string | null,
    private readonly inputMode: InputMode = "none",
    private readonly inputPath: string | null = null
  ) {}

  run(): WalkForwardArtifact {
    const sourceRange = this.resolveSourceRange();
    const windows = buildWalkForwardWindows(sourceRange, this.options);
    const candidates =
      this.candidatesOverride ??
      (this.options.mode === "fixed"
        ? buildFixedCandidate(this.baseConfig)
        : buildSmallParameterGrid(this.baseConfig));
    const results: WindowSelectionResult[] = windows.map((window) => this.runWindow(window, candidates));

    const selectedTestMetrics = results
      .map((result) => result.selectedTestMetrics)
      .filter((metrics): metrics is RunMetrics => metrics !== null);

    return {
      generatedAtUtc: new Date().toISOString(),
      symbol: "MNQ",
      runProvenance: buildRunProvenance({
        dbPath: this.dbPath,
        eventWindowCount: this.eventWindows.length,
        bars: this.bars,
        sourceRange,
        gitCommitSha: this.gitCommitSha,
        inputMode: this.inputMode,
        inputPath: this.inputPath
      }),
      mode: this.options.mode,
      sourceRange,
      windowSpec: {
        trainDays: this.options.trainDays,
        validationDays: this.options.validationDays,
        testDays: this.options.testDays,
        stepDays: this.options.stepDays
      },
      windows: results,
      rolledUpMetrics: combineMetrics(selectedTestMetrics)
    };
  }

  async writeArtifact(artifact: WalkForwardArtifact, artifactsDir = DEFAULT_ARTIFACTS_DIR): Promise<string> {
    await mkdir(artifactsDir, { recursive: true });
    const timestamp = artifact.generatedAtUtc.replace(/[:.]/g, "-");
    const path = join(artifactsDir, `walkforward-${timestamp}.json`);
    await writeFile(path, JSON.stringify(artifact, null, 2), "utf8");
    return path;
  }

  private runWindow(window: WalkForwardWindow, candidates: ParameterCandidate[]): WindowSelectionResult {
    const testedCandidates = candidates.map((candidate) => {
      const trainResult = evaluateCandidate(candidate, this.bars, this.eventWindows, window.train);
      const validationResult = evaluateCandidate(candidate, this.bars, this.eventWindows, window.validation);
      const trainMetrics = computeRunMetrics(trainResult);
      const validationMetrics = computeRunMetrics(validationResult);
      const inSampleMetrics = computeRunMetrics(mergeBacktestResults([trainResult, validationResult]));
      const ranking = rankCandidate(inSampleMetrics);

      return {
        candidate,
        trainMetrics,
        validationMetrics,
        inSampleMetrics,
        isEligible: ranking.eligible,
        score: ranking.score
      };
    });

    const selected = selectBestCandidate(testedCandidates);
    if (!selected) {
      return {
        window,
        testedCandidates,
        selectedCandidate: null,
        selectedTrainMetrics: null,
        selectedValidationMetrics: null,
        selectedInSampleMetrics: null,
        selectedTestMetrics: null,
        status: "skipped",
        reason: "no_candidate_met_minimum_expectancy_or_trade_count"
      };
    }

    const testResult = evaluateCandidate(selected.candidate, this.bars, this.eventWindows, window.test);
    const selectedTestMetrics = computeRunMetrics(testResult);
    return {
      window,
      testedCandidates,
      selectedCandidate: selected.candidate,
      selectedTrainMetrics: selected.trainMetrics,
      selectedValidationMetrics: selected.validationMetrics,
      selectedInSampleMetrics: selected.inSampleMetrics,
      selectedTestMetrics,
      status: "selected"
    };
  }

  private resolveSourceRange(): DateRange {
    const sortedBars = [...this.bars].sort((left, right) => left.tsUtc.localeCompare(right.tsUtc));
    const earliest = sortedBars[0]?.tsUtc;
    const latest = sortedBars[sortedBars.length - 1]?.tsUtc;
    const startUtc = this.options.startUtc ?? earliest;
    const endUtc = this.options.endUtc ?? latest;
    if (!startUtc || !endUtc) {
      throw new Error("WalkForwardRunner requires at least one bar.");
    }
    if (new Date(endUtc).getTime() <= new Date(startUtc).getTime()) {
      throw new Error("WalkForwardRunner requires endUtc > startUtc.");
    }
    const requiredSpan =
      (this.options.trainDays + this.options.validationDays + this.options.testDays) * DAY_MS;
    if (getRangeMs({ startUtc, endUtc }) < requiredSpan) {
      throw new Error("Insufficient bar history for the requested walk-forward window lengths.");
    }
    return { startUtc, endUtc };
  }
}
