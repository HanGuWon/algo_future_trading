import type {
  AccountState,
  Bar,
  EventWindow,
  InstrumentSpec,
  PaperRunResult,
  PersistedPaperState,
  StrategyConfig
} from "../types.js";
import { FeatureEngine } from "../features/featureEngine.js";
import { aggregateBars } from "../data/barAggregation.js";
import { buildResearchSeries } from "../data/rolls.js";
import { isBlockedByEvents } from "../calendars/eventWindows.js";
import { RiskEngine } from "../risk/riskEngine.js";
import { PaperBroker } from "./paperBroker.js";
import { SessionFilteredTrendPullbackStrategy } from "../strategy/sessionFilteredTrendPullback.js";
import { addMinutesUtc, getTradingDateChicago, sessionBoundaryAfter } from "../utils/time.js";

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

function filterBarsFrom(tsUtc: string | null, bars: Bar[], inclusive = false): Bar[] {
  if (!tsUtc) {
    return bars;
  }
  return bars.filter((bar) => (inclusive ? bar.tsUtc >= tsUtc : bar.tsUtc > tsUtc));
}

export class PaperEngine {
  constructor(
    private readonly config: StrategyConfig,
    private readonly spec: InstrumentSpec,
    private readonly startingEquityUsd: number,
    private readonly paperStartUtc: string
  ) {}

  run(rawBars1m: Bar[], eventWindows: EventWindow[], priorState: PersistedPaperState | null): PaperRunResult {
    const eligibleBars1m = [...rawBars1m]
      .filter((bar) => bar.tsUtc >= (priorState?.paperStartUtc ?? this.paperStartUtc))
      .sort((left, right) => left.tsUtc.localeCompare(right.tsUtc));
    if (eligibleBars1m.length === 0) {
      const emptyState = this.buildInitialState(priorState);
      return { trades: [], rejectedSignals: [], finalState: emptyState };
    }

    const executionBars1m = eligibleBars1m;
    const researchBars1m = buildResearchSeries(executionBars1m);
    const executionBars5m = aggregateBars(executionBars1m, "5m");
    const executionBars15m = aggregateBars(executionBars1m, "15m");
    const researchBars1h = aggregateBars(researchBars1m, "1h");
    const featureEngine = new FeatureEngine(new Map([[this.spec.symbol, researchBars1h]]), this.config);
    const strategy = new SessionFilteredTrendPullbackStrategy(this.config);
    const riskEngine = new RiskEngine(this.config, this.spec);
    const paperBroker = new PaperBroker(this.config, this.spec);

    const state = this.buildInitialState(priorState);
    const trades: PaperRunResult["trades"] = [];
    const rejectedSignals: PaperRunResult["rejectedSignals"] = [];

    if (state.activePosition) {
      const activeBars5m = filterBarsFrom(state.activePosition.lastProcessedBarTs, executionBars5m);
      if (state.activePosition.status === "PENDING") {
        const pendingResult = paperBroker.advancePendingOrder(state.activePosition, activeBars5m);
        state.activePosition = pendingResult.nextOrder;
        if (pendingResult.rejectedReason) {
          rejectedSignals.push({
            tsUtc: state.activePosition?.signalTs ?? state.lastProcessedSignalTs ?? executionBars5m[0]?.tsUtc ?? state.paperStartUtc,
            reason: pendingResult.rejectedReason
          });
        }
      }

      if (state.activePosition?.status === "OPEN") {
        const openResult = paperBroker.advanceOpenPosition(
          state.activePosition,
          filterBarsFrom(state.activePosition.lastProcessedBarTs, executionBars5m),
          executionBars15m
        );
        trades.push(...openResult.trades);
        for (const trade of openResult.trades) {
          state.accountState = riskEngine.applyTrade(state.accountState, trade);
          state.currentTradingDate = getTradingDateChicago(trade.exitTs);
        }
        state.activePosition = openResult.nextPosition;
      }
    }

    if (!state.activePosition) {
      for (let index = this.config.maSlow; index < researchBars1h.length; index += 1) {
        const signalBar = researchBars1h[index];
        if (state.lastProcessedSignalTs && signalBar.tsUtc <= state.lastProcessedSignalTs) {
          continue;
        }

        const tradingDate = getTradingDateChicago(signalBar.tsUtc);
        state.accountState = resetIfNewTradingDay(state.accountState, state.currentTradingDate, tradingDate);
        state.currentTradingDate = tradingDate;

        const snapshot = featureEngine.buildSnapshotByIndex(this.spec.symbol, index);
        const blockedWindow = isBlockedByEvents(signalBar.tsUtc, eventWindows);
        const baseSignal = strategy.generate(snapshot, blockedWindow);
        state.lastProcessedSignalTs = signalBar.tsUtc;
        if (!baseSignal) {
          continue;
        }

        const candidate = strategy.finalizeSignal(baseSignal, signalBar.high, signalBar.low, this.spec.tickSize);
        const actionableSignal = {
          ...candidate,
          signalTs: addMinutesUtc(candidate.signalTs, 60)
        };
        const riskDecision = riskEngine.approve(actionableSignal, state.accountState);
        if (!riskDecision.approved) {
          rejectedSignals.push({ tsUtc: signalBar.tsUtc, reason: riskDecision.rejectReason ?? "unknown" });
          continue;
        }

        const sessionExitTs = sessionBoundaryAfter(actionableSignal.signalTs);
        const entryWindowEndTs = addMinutesUtc(actionableSignal.signalTs, 60);
        const submitted = paperBroker.submitStateful(
          actionableSignal,
          riskDecision.qty,
          signalBar.contract,
          actionableSignal.signalTs,
          sessionExitTs,
          entryWindowEndTs
        );

        const pendingResult = paperBroker.advancePendingOrder(
          submitted,
          executionBars5m.filter((bar) => bar.tsUtc > actionableSignal.signalTs)
        );
        if (!pendingResult.nextOrder) {
          rejectedSignals.push({ tsUtc: signalBar.tsUtc, reason: pendingResult.rejectedReason ?? "entry_invalidated" });
          continue;
        }

        if (pendingResult.nextOrder.status === "PENDING") {
          state.activePosition = pendingResult.nextOrder;
          break;
        }

        const openResult = paperBroker.advanceOpenPosition(
          pendingResult.nextOrder,
          filterBarsFrom(pendingResult.nextOrder.lastProcessedBarTs, executionBars5m),
          executionBars15m
        );
        trades.push(...openResult.trades);
        for (const trade of openResult.trades) {
          state.accountState = riskEngine.applyTrade(state.accountState, trade);
          state.currentTradingDate = getTradingDateChicago(trade.exitTs);
        }
        if (openResult.nextPosition) {
          state.activePosition = openResult.nextPosition;
          break;
        }
      }
    }

    state.processedThroughUtc = executionBars1m[executionBars1m.length - 1]?.tsUtc ?? state.processedThroughUtc;
    state.updatedAtUtc = new Date().toISOString();

    return {
      trades,
      rejectedSignals,
      finalState: state
    };
  }

  private buildInitialState(priorState: PersistedPaperState | null): PersistedPaperState {
    if (priorState) {
      return {
        ...priorState,
        activePosition: priorState.activePosition ? { ...priorState.activePosition } : null,
        accountState: { ...priorState.accountState }
      };
    }

    return {
      strategyId: this.config.strategyId,
      symbol: this.spec.symbol,
      paperStartUtc: this.paperStartUtc,
      processedThroughUtc: null,
      lastProcessedSignalTs: null,
      currentTradingDate: null,
      accountState: initialAccountState(this.startingEquityUsd),
      activePosition: null,
      updatedAtUtc: new Date().toISOString()
    };
  }
}
