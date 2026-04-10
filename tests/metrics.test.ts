import { describe, expect, it } from "vitest";
import { computeRunMetrics } from "../src/reporting/metrics.js";
import type { BacktestResult } from "../src/types.js";

describe("run metrics", () => {
  it("computes expectancy, profit factor, drawdown, and breakdowns", () => {
    const result: BacktestResult = {
      trades: [
        {
          id: "1",
          strategyId: "SessionFilteredTrendPullback_v1",
          symbol: "MNQ",
          contract: "H26",
          side: "BUY",
          qty: 1,
          entryTs: "2026-01-05T08:00:00.000Z",
          exitTs: "2026-01-05T09:00:00.000Z",
          entryPx: 100,
          exitPx: 110,
          stopPx: 95,
          targetPx: 110,
          feesUsd: 1,
          slippageUsd: 0.5,
          pnlUsd: 98.5,
          exitReason: "TARGET",
          version: "0.1.0"
        },
        {
          id: "2",
          strategyId: "SessionFilteredTrendPullback_v1",
          symbol: "MNQ",
          contract: "H26",
          side: "SELL",
          qty: 1,
          entryTs: "2026-01-05T15:00:00.000Z",
          exitTs: "2026-01-05T16:00:00.000Z",
          entryPx: 110,
          exitPx: 114,
          stopPx: 114,
          targetPx: 106,
          feesUsd: 1,
          slippageUsd: 0.5,
          pnlUsd: -41.5,
          exitReason: "STOP",
          version: "0.1.0"
        }
      ],
      finalAccountState: {
        equityUsd: 25_057,
        startOfDayEquityUsd: 25_000,
        dailyPnlUsd: 57,
        consecutiveLosses: 1,
        cooldownUntilUtc: "2026-01-05T16:30:00.000Z"
      },
      rejectedSignals: [{ tsUtc: "2026-01-05T11:00:00.000Z", reason: "entry_not_triggered" }]
    };

    const metrics = computeRunMetrics(result);
    expect(metrics.tradeCount).toBe(2);
    expect(metrics.netPnlUsd).toBe(57);
    expect(metrics.expectancyUsd).toBe(28.5);
    expect(metrics.profitFactor).toBeCloseTo(98.5 / 41.5, 6);
    expect(metrics.maxDrawdownUsd).toBe(41.5);
    expect(metrics.rejectedSignalCount).toBe(1);
    expect(metrics.sideBreakdown.BUY.tradeCount).toBe(1);
    expect(metrics.sideBreakdown.SELL.tradeCount).toBe(1);
  });
});
