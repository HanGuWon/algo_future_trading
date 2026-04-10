import type { AccountState, InstrumentSpec, RiskDecision, SignalCandidate, StrategyConfig, TradeRecord } from "../types.js";
import { addMinutesUtc } from "../utils/time.js";

export class RiskEngine {
  constructor(private readonly config: StrategyConfig, private readonly spec: InstrumentSpec) {}

  approve(signal: SignalCandidate, accountState: AccountState): RiskDecision {
    if (accountState.cooldownUntilUtc && signal.signalTs < accountState.cooldownUntilUtc) {
      return { approved: false, qty: 0, riskUsd: 0, rejectReason: "cooldown_active" };
    }

    const maxDailyLossUsd = accountState.startOfDayEquityUsd * this.config.maxDailyLossPct;
    if (Math.abs(Math.min(accountState.dailyPnlUsd, 0)) >= maxDailyLossUsd) {
      return { approved: false, qty: 0, riskUsd: 0, rejectReason: "daily_loss_limit" };
    }

    if (accountState.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      return { approved: false, qty: 0, riskUsd: 0, rejectReason: "consecutive_losses_limit" };
    }

    const stopTicks = Math.abs(signal.entryPx - signal.stopPx) / this.spec.tickSize;
    const riskPerContract = stopTicks * this.spec.tickValue;
    if (riskPerContract <= 0) {
      return { approved: false, qty: 0, riskUsd: 0, rejectReason: "invalid_stop_distance" };
    }

    const riskBudget = accountState.equityUsd * this.config.riskPctPerTrade;
    const qty = Math.floor(riskBudget / riskPerContract);
    if (qty < 1) {
      return { approved: false, qty: 0, riskUsd: riskBudget, rejectReason: "risk_budget_too_small" };
    }

    return { approved: true, qty, riskUsd: riskPerContract * qty };
  }

  applyTrade(accountState: AccountState, trade: TradeRecord): AccountState {
    const nextEquity = accountState.equityUsd + trade.pnlUsd;
    const nextDailyPnl = accountState.dailyPnlUsd + trade.pnlUsd;
    const lossTrade = trade.pnlUsd < 0;
    return {
      equityUsd: nextEquity,
      startOfDayEquityUsd: accountState.startOfDayEquityUsd,
      dailyPnlUsd: nextDailyPnl,
      consecutiveLosses: lossTrade ? accountState.consecutiveLosses + 1 : 0,
      cooldownUntilUtc:
        lossTrade && trade.exitReason === "STOP"
          ? addMinutesUtc(trade.exitTs, this.config.cooldownMinutes)
          : accountState.cooldownUntilUtc
    };
  }
}
