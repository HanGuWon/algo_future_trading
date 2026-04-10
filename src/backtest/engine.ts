import type { AccountState, BacktestResult, Bar, EventWindow, InstrumentSpec, StrategyConfig } from "../types.js";
import { FeatureEngine } from "../features/featureEngine.js";
import { aggregateBars } from "../data/barAggregation.js";
import { buildResearchSeries } from "../data/rolls.js";
import { isBlockedByEvents } from "../calendars/eventWindows.js";
import { RiskEngine } from "../risk/riskEngine.js";
import { PaperBroker } from "../paper/paperBroker.js";
import { SessionFilteredTrendPullbackStrategy } from "../strategy/sessionFilteredTrendPullback.js";
import { addMinutesUtc, buildSessionKey, getTradingDateChicago } from "../utils/time.js";

function initialAccountState(equityUsd: number): AccountState {
  return {
    equityUsd,
    startOfDayEquityUsd: equityUsd,
    dailyPnlUsd: 0,
    consecutiveLosses: 0,
    cooldownUntilUtc: null
  };
}

function resetIfNewTradingDay(accountState: AccountState, currentTradingDate: string | null, nextTradingDate: string): AccountState {
  if (currentTradingDate === nextTradingDate) {
    return accountState;
  }
  return {
    ...accountState,
    startOfDayEquityUsd: accountState.equityUsd,
    dailyPnlUsd: 0
  };
}

function barsForSessionExit(signalTs: string, bars5m: Bar[]): string | null {
  const sessionKey = buildSessionKey(signalTs);
  const sameSessionBars = bars5m.filter((bar) => buildSessionKey(bar.tsUtc) === sessionKey);
  const last = sameSessionBars[sameSessionBars.length - 1];
  return last ? new Date(new Date(last.tsUtc).getTime() + 5 * 60_000).toISOString() : null;
}

function findEntryWindow(signalTs: string, bars5m: Bar[]): Bar[] {
  const signalTime = new Date(signalTs).getTime();
  return bars5m.filter((bar) => {
    const ts = new Date(bar.tsUtc).getTime();
    return ts > signalTime && ts <= signalTime + 60 * 60_000;
  });
}

function remainingBarsFrom(tsUtc: string, bars: Bar[]): Bar[] {
  return bars.filter((bar) => bar.tsUtc >= tsUtc);
}

export class BacktestEngine {
  constructor(
    private readonly config: StrategyConfig,
    private readonly spec: InstrumentSpec,
    private readonly startingEquityUsd: number
  ) {}

  run(rawBars1m: Bar[], eventWindows: EventWindow[]): BacktestResult {
    const executionBars1m = [...rawBars1m].sort((left, right) => left.tsUtc.localeCompare(right.tsUtc));
    const researchBars1m = buildResearchSeries(executionBars1m);
    const executionBars5m = aggregateBars(executionBars1m, "5m");
    const executionBars15m = aggregateBars(executionBars1m, "15m");
    const researchBars1h = aggregateBars(researchBars1m, "1h");
    const featureEngine = new FeatureEngine(new Map([[this.spec.symbol, researchBars1h]]), this.config);
    const strategy = new SessionFilteredTrendPullbackStrategy(this.config);
    const riskEngine = new RiskEngine(this.config, this.spec);
    const paperBroker = new PaperBroker(this.config, this.spec);

    let accountState = initialAccountState(this.startingEquityUsd);
    let currentTradingDate: string | null = null;
    const trades: BacktestResult["trades"] = [];
    const rejectedSignals: BacktestResult["rejectedSignals"] = [];
    let openUntilUtc: string | null = null;

    for (let index = this.config.maSlow; index < researchBars1h.length; index += 1) {
      const bar = researchBars1h[index];
      if (openUntilUtc && bar.tsUtc < openUntilUtc) {
        continue;
      }

      const tradingDate = getTradingDateChicago(bar.tsUtc);
      accountState = resetIfNewTradingDay(accountState, currentTradingDate, tradingDate);
      currentTradingDate = tradingDate;

      const snapshot = featureEngine.buildSnapshotByIndex(this.spec.symbol, index);
      const blockedWindow = isBlockedByEvents(bar.tsUtc, eventWindows);
      const baseSignal = strategy.generate(snapshot, blockedWindow);
      if (!baseSignal) {
        continue;
      }
      const candidate = strategy.finalizeSignal(baseSignal, bar.high, bar.low, this.spec.tickSize);
      const actionableSignal = {
        ...candidate,
        signalTs: addMinutesUtc(candidate.signalTs, 60)
      };
      const riskDecision = riskEngine.approve(actionableSignal, accountState);
      if (!riskDecision.approved) {
        rejectedSignals.push({ tsUtc: bar.tsUtc, reason: riskDecision.rejectReason ?? "unknown" });
        continue;
      }

      const entryBars = findEntryWindow(actionableSignal.signalTs, executionBars5m);
      const sessionExitTs = barsForSessionExit(actionableSignal.signalTs, executionBars5m);
      if (!sessionExitTs) {
        rejectedSignals.push({ tsUtc: bar.tsUtc, reason: "no_session_exit" });
        continue;
      }

      let pendingOrder: ReturnType<PaperBroker["submit"]> | null = paperBroker.submit(
        actionableSignal,
        riskDecision.qty,
        bar.contract,
        actionableSignal.signalTs,
        sessionExitTs
      );
      let filledOrder = null;
      for (const entryBar of entryBars) {
        const maybeFilled = paperBroker.tryFillPending(pendingOrder, entryBar);
        if (maybeFilled === null) {
          rejectedSignals.push({ tsUtc: bar.tsUtc, reason: "entry_invalidated" });
          pendingOrder = null;
          break;
        }
        if (maybeFilled.status === "OPEN") {
          filledOrder = maybeFilled;
          break;
        }
        pendingOrder = maybeFilled;
      }

      if (!filledOrder) {
        if (pendingOrder !== null) {
          rejectedSignals.push({ tsUtc: bar.tsUtc, reason: "entry_not_triggered" });
        }
        continue;
      }

      const tradeRecords = paperBroker.closeOpenOrder(
        filledOrder,
        remainingBarsFrom(filledOrder.submittedTs, executionBars5m),
        remainingBarsFrom(filledOrder.submittedTs, executionBars15m)
      );

      if (tradeRecords.length === 0) {
        continue;
      }

      for (const trade of tradeRecords) {
        trades.push(trade);
        accountState = riskEngine.applyTrade(accountState, trade);
      }
      openUntilUtc = tradeRecords[tradeRecords.length - 1].exitTs;
    }

    return {
      trades,
      finalAccountState: accountState,
      rejectedSignals
    };
  }
}
