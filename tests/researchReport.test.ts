import { describe, expect, it } from "vitest";
import { buildSmallParameterGrid } from "../src/research/parameterGrid.js";
import {
  assessFinalRecommendation,
  buildAcceptanceSlices,
  buildEventScenarioWindows,
  evaluateResearchGates,
  ResearchReportRunner
} from "../src/research/report.js";
import type { DateRange, EventWindow, RunMetrics } from "../src/types.js";
import { expandHourlyShapesTo1m, buildSidewaysHourShapes, buildTrendingHourShapes } from "./helpers.js";

function buildMultiSignalTrendingBars(startUtc: string, hours: number, signalOffsets: number[]) {
  const shapes = buildTrendingHourShapes(startUtc, hours);
  for (const offset of signalOffsets) {
    const signal = shapes[offset];
    const prior = shapes[offset - 1];
    const next = shapes[offset + 1];
    if (!signal || !prior || !next) {
      continue;
    }
    signal.open = prior.close + 2;
    signal.low = prior.low - 12;
    signal.high = prior.close + 10;
    signal.close = signal.high - 0.5;
    next.open = signal.close;
    next.low = signal.close - 0.5;
    next.high = signal.high + 25;
    next.close = next.high - 1;
  }
  return expandHourlyShapesTo1m(shapes);
}

function buildMetrics(overrides: Partial<RunMetrics>): RunMetrics {
  return {
    tradeCount: 1,
    winRate: 100,
    netPnlUsd: 10,
    expectancyUsd: 10,
    profitFactor: 1.5,
    maxDrawdownUsd: 2,
    avgWinUsd: 10,
    avgLossUsd: 0,
    rejectedSignalCount: 0,
    sessionBreakdown: {
      ASIA: { tradeCount: 0, netPnlUsd: 0 },
      EUROPE: { tradeCount: 1, netPnlUsd: 10 },
      US: { tradeCount: 0, netPnlUsd: 0 },
      CLOSED: { tradeCount: 0, netPnlUsd: 0 }
    },
    sideBreakdown: {
      BUY: { tradeCount: 1, netPnlUsd: 10 },
      SELL: { tradeCount: 0, netPnlUsd: 0 }
    },
    ...overrides
  };
}

describe("research report utilities", () => {
  it("builds acceptance slices from explicit ranges", () => {
    const slices = buildAcceptanceSlices({
      train: { startUtc: "2026-01-01T00:00:00.000Z", endUtc: "2026-01-02T00:00:00.000Z" },
      validation: { startUtc: "2026-01-03T00:00:00.000Z", endUtc: "2026-01-04T00:00:00.000Z" },
      test: { startUtc: "2026-01-05T00:00:00.000Z", endUtc: "2026-01-06T00:00:00.000Z" }
    });
    expect(slices.map((slice) => slice.slice)).toEqual(["train", "validation", "test"]);
    expect(slices[0]?.range.startUtc).toBe("2026-01-01T00:00:00.000Z");
    expect(slices[2]?.range.endUtc).toBe("2026-01-06T00:00:00.000Z");
  });

  it("builds default, disabled, and full-session event windows", () => {
    const bars = buildMultiSignalTrendingBars("2026-01-01T00:00:00.000Z", 24 * 6, [125]);
    const range: DateRange = {
      startUtc: "2026-01-01T00:00:00.000Z",
      endUtc: "2026-01-06T23:59:00.000Z"
    };
    const windows: EventWindow[] = [
      {
        eventType: "CPI",
        startUtc: "2026-01-03T14:00:00.000Z",
        endUtc: "2026-01-03T15:00:00.000Z",
        severity: "HIGH",
        blocked: true,
        source: "bls"
      }
    ];

    expect(buildEventScenarioWindows("default", windows, bars, range)).toHaveLength(1);
    expect(buildEventScenarioWindows("disabled", windows, bars, range)).toHaveLength(0);
    const fullSession = buildEventScenarioWindows("full_session", windows, bars, range);
    expect(fullSession).toHaveLength(1);
    expect(fullSession[0]!.startUtc <= windows[0]!.startUtc).toBe(true);
    expect(fullSession[0]!.endUtc >= windows[0]!.endUtc).toBe(true);
  });

  it("assesses the final recommendation deterministically", () => {
    const recommendation = assessFinalRecommendation(
      buildMetrics({ expectancyUsd: 5, tradeCount: 3 }),
      buildMetrics({ expectancyUsd: 4, tradeCount: 3 }),
      [
        {
          candidate: buildSmallParameterGrid()[0]!,
          validationMetrics: buildMetrics({ expectancyUsd: 3 }),
          testMetrics: buildMetrics({ expectancyUsd: 2 }),
          isStable: true,
          rank: 1,
          baselineDelta: {
            validationNetPnlUsd: 0,
            testNetPnlUsd: 0,
            validationExpectancyUsd: 0,
            testExpectancyUsd: 0
          },
          neighborDispersion: {
            validationNetPnlRangeUsd: 0,
            testNetPnlRangeUsd: 0,
            validationExpectancyRangeUsd: 0,
            testExpectancyRangeUsd: 0
          }
        },
        {
          candidate: buildSmallParameterGrid()[1]!,
          validationMetrics: buildMetrics({ expectancyUsd: 2 }),
          testMetrics: buildMetrics({ expectancyUsd: 2 }),
          isStable: true,
          rank: 2,
          baselineDelta: {
            validationNetPnlUsd: 0,
            testNetPnlUsd: 0,
            validationExpectancyUsd: 0,
            testExpectancyUsd: 0
          },
          neighborDispersion: {
            validationNetPnlRangeUsd: 0,
            testNetPnlRangeUsd: 0,
            validationExpectancyRangeUsd: 0,
            testExpectancyRangeUsd: 0
          }
        },
        {
          candidate: buildSmallParameterGrid()[2]!,
          validationMetrics: buildMetrics({ expectancyUsd: 1 }),
          testMetrics: buildMetrics({ expectancyUsd: 1 }),
          isStable: true,
          rank: 3,
          baselineDelta: {
            validationNetPnlUsd: 0,
            testNetPnlUsd: 0,
            validationExpectancyUsd: 0,
            testExpectancyUsd: 0
          },
          neighborDispersion: {
            validationNetPnlRangeUsd: 0,
            testNetPnlRangeUsd: 0,
            validationExpectancyRangeUsd: 0,
            testExpectancyRangeUsd: 0
          }
        }
      ],
      [
        {
          scenario: "default",
          metrics: buildMetrics({ expectancyUsd: 3 }),
          deltaFromBaseline: { tradeCount: 0, netPnlUsd: 0, expectancyUsd: 0, maxDrawdownUsd: 0 }
        },
        {
          scenario: "disabled",
          metrics: buildMetrics({ expectancyUsd: 4 }),
          deltaFromBaseline: { tradeCount: 1, netPnlUsd: 5, expectancyUsd: 1, maxDrawdownUsd: 0 }
        },
        {
          scenario: "full_session",
          metrics: buildMetrics({ expectancyUsd: 2 }),
          deltaFromBaseline: { tradeCount: -1, netPnlUsd: -5, expectancyUsd: -1, maxDrawdownUsd: 1 }
        }
      ],
      true,
      []
    );

    expect(recommendation.recommendation).toBe("continue_paper");
    expect(recommendation.parameter_stability_pass).toBe(true);
    expect(recommendation.gatePass).toBe(true);
  });

  it("evaluates research gates deterministically", () => {
    const evaluation = evaluateResearchGates({
      gateConfig: {
        minTrades: 5,
        minSelectedWalkforwardWindows: 2,
        minExpectancyUsd: 0,
        maxDrawdownUsd: 50
      },
      baselineTestMetrics: buildMetrics({ tradeCount: 6, expectancyUsd: 2, maxDrawdownUsd: 10 }),
      walkforwardMetrics: buildMetrics({ tradeCount: 5, expectancyUsd: 1, maxDrawdownUsd: 12 }),
      selectedWalkforwardWindows: 2,
      topCandidates: [
        {
          candidate: buildSmallParameterGrid()[0]!,
          validationMetrics: buildMetrics({ tradeCount: 5 }),
          testMetrics: buildMetrics({ tradeCount: 5 }),
          isStable: true,
          rank: 1,
          baselineDelta: {
            validationNetPnlUsd: 0,
            testNetPnlUsd: 0,
            validationExpectancyUsd: 0,
            testExpectancyUsd: 0
          },
          neighborDispersion: {
            validationNetPnlRangeUsd: 0,
            testNetPnlRangeUsd: 0,
            validationExpectancyRangeUsd: 0,
            testExpectancyRangeUsd: 0
          }
        }
      ]
    });

    expect(evaluation.gatePass).toBe(true);
    expect(evaluation.gateFailureReasons).toHaveLength(0);
    expect(evaluation.gateResults.selectedWalkforwardWindows.passed).toBe(true);
  });

  it("fails research gates on insufficient sample size", () => {
    const evaluation = evaluateResearchGates({
      gateConfig: {
        minTrades: 5,
        minSelectedWalkforwardWindows: 2,
        minExpectancyUsd: 0,
        maxDrawdownUsd: 50
      },
      baselineTestMetrics: buildMetrics({ tradeCount: 1, expectancyUsd: 2, maxDrawdownUsd: 10 }),
      walkforwardMetrics: buildMetrics({ tradeCount: 1, expectancyUsd: -1, maxDrawdownUsd: 60 }),
      selectedWalkforwardWindows: 1,
      topCandidates: []
    });

    expect(evaluation.gatePass).toBe(false);
    expect(evaluation.gateFailureReasons.length).toBeGreaterThan(0);
    expect(evaluation.gateResults.walkforwardExpectancy.passed).toBe(false);
  });
});

describe("research report runner", () => {
  it("builds all sections on a trending synthetic dataset", () => {
    const bars = buildMultiSignalTrendingBars("2026-01-01T00:00:00.000Z", 24 * 20, [125, 220, 315, 410]);
    const candidates = buildSmallParameterGrid().slice(0, 3);
    const runner = new ResearchReportRunner(bars, [], {
      acceptanceSplit: {
        train: { startUtc: "2026-01-01T00:00:00.000Z", endUtc: "2026-01-06T23:59:00.000Z" },
        validation: { startUtc: "2026-01-07T00:00:00.000Z", endUtc: "2026-01-12T23:59:00.000Z" },
        test: { startUtc: "2026-01-13T00:00:00.000Z", endUtc: "2026-01-18T23:59:00.000Z" }
      },
      walkforwardOptions: {
        mode: "grid",
        startUtc: "2026-01-01T00:00:00.000Z",
        endUtc: "2026-01-20T23:59:00.000Z",
        trainDays: 6,
        validationDays: 3,
        testDays: 3,
        stepDays: 4
      },
      gateConfig: {
        minTrades: 0,
        minSelectedWalkforwardWindows: 1,
        minExpectancyUsd: 0,
        maxDrawdownUsd: 1_000
      },
      sensitivityTopCount: 3,
      sensitivityCandidates: candidates,
      walkforwardCandidates: [candidates[0]!]
    });

    const artifact = runner.run();
    expect(artifact.baseline.test.metrics.tradeCount).toBeGreaterThanOrEqual(0);
    expect(artifact.walkforward.windowCount).toBeGreaterThan(0);
    expect(artifact.sensitivity.topCandidates.length).toBe(3);
    expect(artifact.eventComparison.scenarios).toHaveLength(3);
    expect(artifact.finalAssessment.gatePass).toBe(true);
    expect(["continue_paper", "research_more", "reject_current_rule_set"]).toContain(
      artifact.finalAssessment.recommendation
    );
  }, 30000);

  it("returns a conservative recommendation on a sideways synthetic dataset", () => {
    const bars = expandHourlyShapesTo1m(buildSidewaysHourShapes("2026-01-01T00:00:00.000Z", 24 * 20));
    const candidates = buildSmallParameterGrid().slice(0, 3);
    const runner = new ResearchReportRunner(bars, [], {
      acceptanceSplit: {
        train: { startUtc: "2026-01-01T00:00:00.000Z", endUtc: "2026-01-06T23:59:00.000Z" },
        validation: { startUtc: "2026-01-07T00:00:00.000Z", endUtc: "2026-01-12T23:59:00.000Z" },
        test: { startUtc: "2026-01-13T00:00:00.000Z", endUtc: "2026-01-18T23:59:00.000Z" }
      },
      walkforwardOptions: {
        mode: "grid",
        startUtc: "2026-01-01T00:00:00.000Z",
        endUtc: "2026-01-20T23:59:00.000Z",
        trainDays: 6,
        validationDays: 3,
        testDays: 3,
        stepDays: 4
      },
      gateConfig: {
        minTrades: 5,
        minSelectedWalkforwardWindows: 2,
        minExpectancyUsd: 0,
        maxDrawdownUsd: 50
      },
      sensitivityTopCount: 3,
      sensitivityCandidates: candidates,
      walkforwardCandidates: [candidates[0]!]
    });

    const artifact = runner.run();
    expect(artifact.finalAssessment.gatePass).toBe(false);
    expect(["research_more", "reject_current_rule_set"]).toContain(artifact.finalAssessment.recommendation);
  }, 30000);
});
