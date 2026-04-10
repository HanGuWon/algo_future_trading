import { describe, expect, it } from "vitest";
import { DEFAULT_STRATEGY_CONFIG, MNQ_SPEC } from "../src/config/defaults.js";
import { RiskEngine } from "../src/risk/riskEngine.js";
import type { AccountState, SignalCandidate, TradeRecord } from "../src/types.js";

const baseSignal: SignalCandidate = {
  side: "BUY",
  signalTs: "2026-01-05T14:00:00.000Z",
  entryPx: 100,
  stopPx: 95,
  score: 4,
  invalidationPx: 95.25,
  targetPx: 105,
  reasons: ["ma_alignment", "reversal_candle", "pivot_cluster", "session_break_context"]
};

const baseAccountState: AccountState = {
  equityUsd: 25_000,
  startOfDayEquityUsd: 25_000,
  dailyPnlUsd: 0,
  consecutiveLosses: 0,
  cooldownUntilUtc: null
};

describe("risk engine", () => {
  it("sizes positions from fixed account risk", () => {
    const engine = new RiskEngine(DEFAULT_STRATEGY_CONFIG, MNQ_SPEC);
    const decision = engine.approve(baseSignal, baseAccountState);
    expect(decision.approved).toBe(true);
    expect(decision.qty).toBeGreaterThanOrEqual(1);
  });

  it("enforces cooldown and daily loss circuit breakers", () => {
    const engine = new RiskEngine(DEFAULT_STRATEGY_CONFIG, MNQ_SPEC);
    const stoppedTrade: TradeRecord = {
      id: "1",
      strategyId: DEFAULT_STRATEGY_CONFIG.strategyId,
      symbol: "MNQ",
      contract: "H26",
      side: "BUY",
      qty: 1,
      entryTs: "2026-01-05T14:05:00.000Z",
      exitTs: "2026-01-05T14:10:00.000Z",
      entryPx: 100,
      exitPx: 95,
      stopPx: 95,
      targetPx: 105,
      feesUsd: 1,
      slippageUsd: 0.5,
      pnlUsd: -251.5,
      exitReason: "STOP",
      version: "0.1.0"
    };
    const cooled = engine.applyTrade(baseAccountState, stoppedTrade);
    expect(cooled.cooldownUntilUtc).toBe("2026-01-05T14:40:00.000Z");
    expect(engine.approve({ ...baseSignal, signalTs: "2026-01-05T14:20:00.000Z" }, cooled).approved).toBe(false);
    expect(
      engine.approve(
        { ...baseSignal, signalTs: "2026-01-05T15:00:00.000Z" },
        { ...cooled, dailyPnlUsd: -260, startOfDayEquityUsd: 25_000 }
      ).approved
    ).toBe(false);
  });
});
