import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWalkForwardWindows, rankCandidate, selectBestCandidate, WalkForwardRunner } from "../src/research/walkforward.js";
import { buildFixedCandidate } from "../src/research/parameterGrid.js";
import { DEFAULT_STRATEGY_CONFIG } from "../src/config/defaults.js";
import type { CandidateEvaluation, DateRange } from "../src/types.js";
import { expandHourlyShapesTo1m, buildTrendingHourShapes, buildSidewaysHourShapes } from "./helpers.js";

describe("walk-forward windows", () => {
  it("generates rolling train/validation/test windows", () => {
    const range: DateRange = {
      startUtc: "2026-01-01T00:00:00.000Z",
      endUtc: "2026-01-10T00:00:00.000Z"
    };
    const windows = buildWalkForwardWindows(range, {
      mode: "grid",
      trainDays: 3,
      validationDays: 2,
      testDays: 2,
      stepDays: 2
    });
    expect(windows).toHaveLength(2);
    expect(windows[0].id).toBe("wf_001");
    expect(windows[1].train.startUtc).toBe("2026-01-03T00:00:00.000Z");
  });
});

describe("candidate selection", () => {
  it("breaks ties deterministically by candidate id after metric ties", () => {
    const baseEvaluation = {
      trainMetrics: {
        tradeCount: 2,
        winRate: 50,
        netPnlUsd: 10,
        expectancyUsd: 5,
        profitFactor: 1.2,
        maxDrawdownUsd: 5,
        avgWinUsd: 20,
        avgLossUsd: -10,
        rejectedSignalCount: 0,
        sessionBreakdown: {
          ASIA: { tradeCount: 0, netPnlUsd: 0 },
          EUROPE: { tradeCount: 1, netPnlUsd: 5 },
          US: { tradeCount: 1, netPnlUsd: 5 },
          CLOSED: { tradeCount: 0, netPnlUsd: 0 }
        },
        sideBreakdown: {
          BUY: { tradeCount: 1, netPnlUsd: 5 },
          SELL: { tradeCount: 1, netPnlUsd: 5 }
        }
      },
      validationMetrics: undefined,
      inSampleMetrics: undefined,
      isEligible: true,
      score: "1"
    };

    const left: CandidateEvaluation = {
      ...baseEvaluation,
      candidate: {
        id: "a",
        config: {
          strategyId: "SessionFilteredTrendPullback_v1",
          signalTimeframe: "1h",
          executionTimeframe: "5m",
          trailingTimeframe: "15m",
          maFast: 10,
          maSlow: 80,
          bollingerPeriod: 20,
          bollingerStdDev: 2,
          confluenceThreshold: 3,
          riskPctPerTrade: 0.0025,
          maxDailyLossPct: 0.01,
          maxConsecutiveLosses: 3,
          cooldownMinutes: 30,
          commissionPerContractUsd: 1.14,
          defaultSlippageTicks: 1,
          usOpenSlippageTicks: 2,
          europeTradableMinutes: 90,
          usTradableMinutes: 120,
          eventBlackoutMinutesBefore: 30,
          eventBlackoutMinutesAfter: 60
        }
      },
      validationMetrics: baseEvaluation.trainMetrics,
      inSampleMetrics: baseEvaluation.trainMetrics
    };
    const right: CandidateEvaluation = {
      ...left,
      candidate: {
        ...left.candidate,
        id: "b"
      }
    };

    expect(selectBestCandidate([right, left])?.candidate.id).toBe("a");
    expect(rankCandidate(left.inSampleMetrics).eligible).toBe(true);
  });
});

describe("walk-forward runner", () => {
  it("produces at least one selected window on a trending synthetic dataset", async () => {
    const bars = expandHourlyShapesTo1m(buildTrendingHourShapes("2025-12-31T09:00:00.000Z", 24 * 10, 125));
    const candidates = buildFixedCandidate({
      ...DEFAULT_STRATEGY_CONFIG,
      maFast: 10,
      maSlow: 20,
      confluenceThreshold: 3
    });
    const runner = new WalkForwardRunner(bars, [], {
      mode: "fixed",
      trainDays: 6,
      validationDays: 1,
      testDays: 1,
      stepDays: 20
    }, candidates);
    const artifact = runner.run();
    expect(artifact.windows.length).toBeGreaterThan(0);
    expect(artifact.windows.some((window) => window.status === "selected")).toBe(true);

    const dir = await mkdtemp(join(tmpdir(), "wf-artifacts-"));
    const path = await runner.writeArtifact(artifact, dir);
    const parsed = JSON.parse(await readFile(path, "utf8"));
    expect(parsed.symbol).toBe("MNQ");
    expect(Array.isArray(parsed.windows)).toBe(true);
    expect(parsed.windowSpec.trainDays).toBe(6);
  });

  it("marks windows as skipped when no candidate clears the minimum threshold", () => {
    const bars = expandHourlyShapesTo1m(buildSidewaysHourShapes("2025-12-31T09:00:00.000Z", 24 * 10));
    const candidates = buildFixedCandidate({
      ...DEFAULT_STRATEGY_CONFIG,
      maFast: 10,
      maSlow: 20,
      confluenceThreshold: 3
    });
    const runner = new WalkForwardRunner(bars, [], {
      mode: "fixed",
      trainDays: 6,
      validationDays: 1,
      testDays: 1,
      stepDays: 20
    }, candidates);
    const artifact = runner.run();
    expect(artifact.windows.every((window) => window.status === "skipped")).toBe(true);
  });
});
