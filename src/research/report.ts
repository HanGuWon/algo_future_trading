import { BacktestEngine } from "../backtest/engine.js";
import {
  ACCEPTANCE_SPLIT,
  DEFAULT_ACCOUNT_EQUITY_USD,
  DEFAULT_RESEARCH_GATE_CONFIG,
  DEFAULT_STRATEGY_CONFIG,
  DEFAULT_WALKFORWARD_DAYS,
  MNQ_SPEC
} from "../config/defaults.js";
import { computeRunMetrics } from "../reporting/metrics.js";
import { buildCandidateId, buildSmallParameterGrid } from "./parameterGrid.js";
import { WalkForwardRunner } from "./walkforward.js";
import { assessFinalRecommendation, evaluateResearchGates } from "./gates.js";
import { getTradingDateChicago } from "../utils/time.js";
import { buildRunProvenance } from "../utils/runProvenance.js";
import type {
  AcceptanceSliceResult,
  BacktestResult,
  Bar,
  DateRange,
  EventScenarioResult,
  EventWindow,
  ParameterCandidate,
  ResearchReportArtifact,
  ResearchGateConfig,
  RunMetrics,
  SensitivityCandidateResult,
  StrategyConfig,
  WalkForwardRunOptions
} from "../types.js";

export { assessFinalRecommendation, evaluateResearchGates } from "./gates.js";

interface AcceptanceSplitConfig {
  train: DateRange;
  validation: DateRange;
  test: DateRange;
}

interface ResearchReportRunnerOptions {
  acceptanceSplit?: AcceptanceSplitConfig;
  walkforwardOptions?: WalkForwardRunOptions;
  sensitivityTopCount?: number;
  sensitivityCandidates?: ParameterCandidate[];
  walkforwardCandidates?: ParameterCandidate[];
  baseConfig?: StrategyConfig;
  gateConfig?: ResearchGateConfig;
  dbPath?: string | null;
  gitCommitSha?: string | null;
}

function defaultAcceptanceSplit(): AcceptanceSplitConfig {
  return {
    train: {
      startUtc: ACCEPTANCE_SPLIT.trainStart,
      endUtc: ACCEPTANCE_SPLIT.trainEnd
    },
    validation: {
      startUtc: ACCEPTANCE_SPLIT.validationStart,
      endUtc: ACCEPTANCE_SPLIT.validationEnd
    },
    test: {
      startUtc: ACCEPTANCE_SPLIT.testStart,
      endUtc: ACCEPTANCE_SPLIT.testEnd
    }
  };
}

export function buildAcceptanceSlices(split: AcceptanceSplitConfig = defaultAcceptanceSplit()): AcceptanceSliceResult[] {
  return [
    { slice: "train", range: split.train, metrics: emptyMetricsPlaceholder() },
    { slice: "validation", range: split.validation, metrics: emptyMetricsPlaceholder() },
    { slice: "test", range: split.test, metrics: emptyMetricsPlaceholder() }
  ];
}

function emptyMetricsPlaceholder(): RunMetrics {
  return {
    tradeCount: 0,
    winRate: 0,
    netPnlUsd: 0,
    expectancyUsd: 0,
    profitFactor: null,
    maxDrawdownUsd: 0,
    avgWinUsd: 0,
    avgLossUsd: 0,
    rejectedSignalCount: 0,
    sessionBreakdown: {
      ASIA: { tradeCount: 0, netPnlUsd: 0 },
      EUROPE: { tradeCount: 0, netPnlUsd: 0 },
      US: { tradeCount: 0, netPnlUsd: 0 },
      CLOSED: { tradeCount: 0, netPnlUsd: 0 }
    },
    sideBreakdown: {
      BUY: { tradeCount: 0, netPnlUsd: 0 },
      SELL: { tradeCount: 0, netPnlUsd: 0 }
    }
  };
}

function filterBarsByRange(bars: Bar[], range: DateRange): Bar[] {
  return bars.filter((bar) => bar.tsUtc >= range.startUtc && bar.tsUtc <= range.endUtc);
}

function filterEventsByRange(windows: EventWindow[], range: DateRange): EventWindow[] {
  return windows.filter((window) => window.endUtc >= range.startUtc && window.startUtc <= range.endUtc);
}

function runBacktestForRange(
  config: StrategyConfig,
  bars: Bar[],
  eventWindows: EventWindow[],
  range: DateRange
): BacktestResult {
  const engine = new BacktestEngine(config, MNQ_SPEC, DEFAULT_ACCOUNT_EQUITY_USD);
  return engine.run(filterBarsByRange(bars, range), filterEventsByRange(eventWindows, range));
}

function runMetricsForRange(
  config: StrategyConfig,
  bars: Bar[],
  eventWindows: EventWindow[],
  range: DateRange
): RunMetrics {
  return computeRunMetrics(runBacktestForRange(config, bars, eventWindows, range));
}

export function buildEventScenarioWindows(
  scenario: EventScenarioResult["scenario"],
  baseWindows: EventWindow[],
  bars: Bar[],
  range: DateRange
): EventWindow[] {
  const windows = filterEventsByRange(baseWindows, range);
  if (scenario === "disabled") {
    return [];
  }
  if (scenario === "default") {
    return windows;
  }

  const barsByTradingDate = new Map<string, Bar[]>();
  for (const bar of filterBarsByRange(bars, range)) {
    const tradingDate = getTradingDateChicago(bar.tsUtc);
    const bucket = barsByTradingDate.get(tradingDate) ?? [];
    bucket.push(bar);
    barsByTradingDate.set(tradingDate, bucket);
  }

  const uniqueTradingDates = [...new Set(windows.map((window) => getTradingDateChicago(window.startUtc)))];
  return uniqueTradingDates.flatMap((tradingDate) => {
    const tradingBars = barsByTradingDate.get(tradingDate) ?? [];
    if (tradingBars.length === 0) {
      return [];
    }
    return [
      {
        eventType: "FOMC",
        startUtc: tradingBars[0].tsUtc,
        endUtc: tradingBars[tradingBars.length - 1].tsUtc,
        severity: "HIGH" as const,
        blocked: true,
        source: "research_full_session",
        notes: `full_session_event_day:${tradingDate}`
      }
    ];
  });
}

function baselineEventComparisonRange(split: AcceptanceSplitConfig): DateRange {
  return {
    startUtc: split.validation.startUtc,
    endUtc: split.test.endUtc
  };
}

function isStableSensitivityCandidate(result: SensitivityCandidateResult): boolean {
  return (
    result.validationMetrics.tradeCount > 0 &&
    result.testMetrics.tradeCount > 0 &&
    result.validationMetrics.expectancyUsd > 0 &&
    result.testMetrics.expectancyUsd > 0
  );
}

function sensitivityComparator(left: SensitivityCandidateResult, right: SensitivityCandidateResult): number {
  const leftValidationPositive = left.validationMetrics.expectancyUsd > 0 ? 1 : 0;
  const rightValidationPositive = right.validationMetrics.expectancyUsd > 0 ? 1 : 0;
  if (leftValidationPositive !== rightValidationPositive) {
    return rightValidationPositive - leftValidationPositive;
  }

  const leftTestPositive = left.testMetrics.expectancyUsd > 0 ? 1 : 0;
  const rightTestPositive = right.testMetrics.expectancyUsd > 0 ? 1 : 0;
  if (leftTestPositive !== rightTestPositive) {
    return rightTestPositive - leftTestPositive;
  }

  const leftTradesPositive = left.validationMetrics.tradeCount > 0 && left.testMetrics.tradeCount > 0 ? 1 : 0;
  const rightTradesPositive = right.validationMetrics.tradeCount > 0 && right.testMetrics.tradeCount > 0 ? 1 : 0;
  if (leftTradesPositive !== rightTradesPositive) {
    return rightTradesPositive - leftTradesPositive;
  }

  const leftMaxDrawdown = Math.max(left.validationMetrics.maxDrawdownUsd, left.testMetrics.maxDrawdownUsd);
  const rightMaxDrawdown = Math.max(right.validationMetrics.maxDrawdownUsd, right.testMetrics.maxDrawdownUsd);
  if (leftMaxDrawdown !== rightMaxDrawdown) {
    return leftMaxDrawdown - rightMaxDrawdown;
  }

  const leftNetPnl = left.validationMetrics.netPnlUsd + left.testMetrics.netPnlUsd;
  const rightNetPnl = right.validationMetrics.netPnlUsd + right.testMetrics.netPnlUsd;
  if (leftNetPnl !== rightNetPnl) {
    return rightNetPnl - leftNetPnl;
  }

  return left.candidate.id.localeCompare(right.candidate.id);
}

function isNeighbor(left: StrategyConfig, right: StrategyConfig): boolean {
  let differenceCount = 0;
  if (left.maFast !== right.maFast) {
    differenceCount += 1;
  }
  if (left.maSlow !== right.maSlow) {
    differenceCount += 1;
  }
  if (left.confluenceThreshold !== right.confluenceThreshold) {
    differenceCount += 1;
  }
  if (left.eventBlackoutMinutesAfter !== right.eventBlackoutMinutesAfter) {
    differenceCount += 1;
  }
  return differenceCount === 1;
}

function computeNeighborDispersion(
  candidate: ParameterCandidate,
  results: Array<{ candidate: ParameterCandidate; validationMetrics: RunMetrics; testMetrics: RunMetrics }>
): SensitivityCandidateResult["neighborDispersion"] {
  const neighbors = results.filter((result) => isNeighbor(candidate.config, result.candidate.config));
  if (neighbors.length === 0) {
    return {
      validationNetPnlRangeUsd: 0,
      testNetPnlRangeUsd: 0,
      validationExpectancyRangeUsd: 0,
      testExpectancyRangeUsd: 0
    };
  }

  const validationNet = neighbors.map((neighbor) => neighbor.validationMetrics.netPnlUsd);
  const testNet = neighbors.map((neighbor) => neighbor.testMetrics.netPnlUsd);
  const validationExpectancy = neighbors.map((neighbor) => neighbor.validationMetrics.expectancyUsd);
  const testExpectancy = neighbors.map((neighbor) => neighbor.testMetrics.expectancyUsd);

  return {
    validationNetPnlRangeUsd: Math.max(...validationNet) - Math.min(...validationNet),
    testNetPnlRangeUsd: Math.max(...testNet) - Math.min(...testNet),
    validationExpectancyRangeUsd: Math.max(...validationExpectancy) - Math.min(...validationExpectancy),
    testExpectancyRangeUsd: Math.max(...testExpectancy) - Math.min(...testExpectancy)
  };
}

export class ResearchReportRunner {
  private readonly acceptanceSplit: AcceptanceSplitConfig;
  private readonly walkforwardOptions: WalkForwardRunOptions;
  private readonly sensitivityTopCount: number;
  private readonly sensitivityCandidates: ParameterCandidate[] | undefined;
  private readonly walkforwardCandidates: ParameterCandidate[] | undefined;
  private readonly baseConfig: StrategyConfig;
  private readonly gateConfig: ResearchGateConfig;
  private readonly dbPath: string | null;
  private readonly gitCommitSha: string | null | undefined;

  constructor(
    private readonly bars: Bar[],
    private readonly eventWindows: EventWindow[],
    options: ResearchReportRunnerOptions = {}
  ) {
    this.acceptanceSplit = options.acceptanceSplit ?? defaultAcceptanceSplit();
    this.baseConfig = options.baseConfig ?? DEFAULT_STRATEGY_CONFIG;
    this.walkforwardOptions = options.walkforwardOptions ?? {
      mode: "grid",
      startUtc: this.acceptanceSplit.train.startUtc,
      endUtc: this.acceptanceSplit.test.endUtc,
      trainDays: DEFAULT_WALKFORWARD_DAYS.trainDays,
      validationDays: DEFAULT_WALKFORWARD_DAYS.validationDays,
      testDays: DEFAULT_WALKFORWARD_DAYS.testDays,
      stepDays: DEFAULT_WALKFORWARD_DAYS.stepDays
    };
    this.sensitivityTopCount = options.sensitivityTopCount ?? 5;
    this.sensitivityCandidates = options.sensitivityCandidates;
    this.walkforwardCandidates = options.walkforwardCandidates;
    this.gateConfig = options.gateConfig ?? DEFAULT_RESEARCH_GATE_CONFIG;
    this.dbPath = options.dbPath ?? null;
    this.gitCommitSha = options.gitCommitSha;
  }

  run(): ResearchReportArtifact {
    const baselineTrain: AcceptanceSliceResult = {
      slice: "train",
      range: this.acceptanceSplit.train,
      metrics: runMetricsForRange(this.baseConfig, this.bars, this.eventWindows, this.acceptanceSplit.train)
    };
    const baselineValidation: AcceptanceSliceResult = {
      slice: "validation",
      range: this.acceptanceSplit.validation,
      metrics: runMetricsForRange(this.baseConfig, this.bars, this.eventWindows, this.acceptanceSplit.validation)
    };
    const baselineTest: AcceptanceSliceResult = {
      slice: "test",
      range: this.acceptanceSplit.test,
      metrics: runMetricsForRange(this.baseConfig, this.bars, this.eventWindows, this.acceptanceSplit.test)
    };

    const walkforwardArtifact = new WalkForwardRunner(
      this.bars,
      this.eventWindows,
      this.walkforwardOptions,
      this.walkforwardCandidates,
      this.baseConfig
    ).run();
    const walkforwardSummary: ResearchReportArtifact["walkforward"] = {
      mode: walkforwardArtifact.mode,
      windowCount: walkforwardArtifact.windows.length,
      selectedWindowCount: walkforwardArtifact.windows.filter((window) => window.status === "selected").length,
      rolledUpMetrics: walkforwardArtifact.rolledUpMetrics,
      windows: walkforwardArtifact.windows.map((window) => ({
        id: window.window.id,
        status: window.status,
        selectedCandidateId: window.selectedCandidate?.id ?? null,
        selectedTestMetrics: window.selectedTestMetrics
      }))
    };

    const sensitivityCandidates = this.sensitivityCandidates ?? buildSmallParameterGrid(this.baseConfig);
    const rawSensitivityResults = sensitivityCandidates.map((candidate) => ({
      candidate,
      validationMetrics: runMetricsForRange(
        candidate.config,
        this.bars,
        this.eventWindows,
        this.acceptanceSplit.validation
      ),
      testMetrics: runMetricsForRange(candidate.config, this.bars, this.eventWindows, this.acceptanceSplit.test)
    }));

    const baselineCandidateId = buildCandidateId(this.baseConfig);
    const baselineSensitivity = rawSensitivityResults.find((result) => result.candidate.id === sensitivityCandidates.find((candidate) => candidate.id === baselineCandidateId)?.id)
      ?? rawSensitivityResults.find((result) => result.candidate.id === sensitivityCandidates[0]?.id);

    const baselineValidationMetrics = baselineSensitivity?.validationMetrics ?? baselineValidation.metrics;
    const baselineTestMetrics = baselineSensitivity?.testMetrics ?? baselineTest.metrics;

    const rankedSensitivity = rawSensitivityResults
      .map((result) => ({
        candidate: result.candidate,
        validationMetrics: result.validationMetrics,
        testMetrics: result.testMetrics,
        isStable: false,
        rank: 0,
        baselineDelta: {
          validationNetPnlUsd: result.validationMetrics.netPnlUsd - baselineValidationMetrics.netPnlUsd,
          testNetPnlUsd: result.testMetrics.netPnlUsd - baselineTestMetrics.netPnlUsd,
          validationExpectancyUsd: result.validationMetrics.expectancyUsd - baselineValidationMetrics.expectancyUsd,
          testExpectancyUsd: result.testMetrics.expectancyUsd - baselineTestMetrics.expectancyUsd
        },
        neighborDispersion: computeNeighborDispersion(result.candidate, rawSensitivityResults)
      }))
      .sort(sensitivityComparator)
      .map((result, index) => {
        const next = {
          ...result,
          rank: index + 1
        };
        return {
          ...next,
          isStable: isStableSensitivityCandidate(next)
        };
      });

    const baselineRank =
      rankedSensitivity.find((result) => result.candidate.id === baselineSensitivity?.candidate.id)?.rank ?? null;

    const sensitivitySummary: ResearchReportArtifact["sensitivity"] = {
      baselineCandidateId: baselineSensitivity?.candidate.id ?? "unknown",
      baselineRank,
      totalCandidates: rankedSensitivity.length,
      stableCandidateCount: rankedSensitivity.filter((candidate) => candidate.isStable).length,
      topCandidates: rankedSensitivity.slice(0, this.sensitivityTopCount)
    };

    const eventRange = baselineEventComparisonRange(this.acceptanceSplit);
    const defaultEventMetrics = runMetricsForRange(
      this.baseConfig,
      this.bars,
      buildEventScenarioWindows("default", this.eventWindows, this.bars, eventRange),
      eventRange
    );
    const eventScenarios: EventScenarioResult[] = (["default", "disabled", "full_session"] as const).map((scenario) => {
      const metrics =
        scenario === "default"
          ? defaultEventMetrics
          : runMetricsForRange(
              this.baseConfig,
              this.bars,
              buildEventScenarioWindows(scenario, this.eventWindows, this.bars, eventRange),
              eventRange
            );
      return {
        scenario,
        metrics,
        deltaFromBaseline: {
          tradeCount: metrics.tradeCount - defaultEventMetrics.tradeCount,
          netPnlUsd: metrics.netPnlUsd - defaultEventMetrics.netPnlUsd,
          expectancyUsd: metrics.expectancyUsd - defaultEventMetrics.expectancyUsd,
          maxDrawdownUsd: metrics.maxDrawdownUsd - defaultEventMetrics.maxDrawdownUsd
        }
      };
    });

    const gateEvaluation = evaluateResearchGates({
      gateConfig: this.gateConfig,
      baselineTestMetrics: baselineTest.metrics,
      walkforwardMetrics: walkforwardSummary.rolledUpMetrics,
      selectedWalkforwardWindows: walkforwardSummary.selectedWindowCount,
      topCandidates: sensitivitySummary.topCandidates
    });

    const finalAssessment = assessFinalRecommendation(
      baselineTest.metrics,
      walkforwardSummary.rolledUpMetrics,
      sensitivitySummary.topCandidates,
      eventScenarios,
      gateEvaluation.gatePass,
      gateEvaluation.gateFailureReasons
    );

    return {
      generatedAtUtc: new Date().toISOString(),
      symbol: MNQ_SPEC.symbol,
      strategyId: this.baseConfig.strategyId,
      runProvenance: buildRunProvenance({
        dbPath: this.dbPath,
        eventWindowCount: this.eventWindows.length,
        bars: this.bars,
        gitCommitSha: this.gitCommitSha
      }),
      baseline: {
        train: baselineTrain,
        validation: baselineValidation,
        test: baselineTest
      },
      walkforward: walkforwardSummary,
      sensitivity: sensitivitySummary,
      eventComparison: {
        range: eventRange,
        baselineScenario: "default",
        scenarios: eventScenarios
      },
      gateConfig: this.gateConfig,
      gateResults: gateEvaluation.gateResults,
      finalAssessment
    };
  }
}
