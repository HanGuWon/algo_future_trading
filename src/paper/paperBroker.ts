import { randomUUID } from "node:crypto";
import type {
  Bar,
  InstrumentSpec,
  PaperOrder,
  PaperPositionState,
  SignalCandidate,
  StrategyConfig,
  TradeRecord
} from "../types.js";
import { buildSessionKey } from "../utils/time.js";

function tickSlippageUsd(qty: number, ticks: number, tickValue: number): number {
  return qty * ticks * tickValue;
}

function effectivePrice(base: number, side: "BUY" | "SELL", ticks: number, tickSize: number): number {
  return side === "BUY" ? base + ticks * tickSize : base - ticks * tickSize;
}

export class PaperBroker {
  constructor(private readonly config: StrategyConfig, private readonly spec: InstrumentSpec) {}

  submit(signal: SignalCandidate, qty: number, contract: string, submittedTs: string, sessionExitTs: string): PaperOrder {
    return {
      id: randomUUID(),
      strategyId: this.config.strategyId,
      symbol: this.spec.symbol,
      contract,
      side: signal.side,
      qty,
      entryPx: signal.entryPx,
      stopPx: signal.stopPx,
      targetPx: signal.targetPx,
      signalTs: signal.signalTs,
      submittedTs,
      status: "PENDING",
      filledQty: 0,
      breakEvenArmed: false,
      sessionExitTs
    };
  }

  submitStateful(
    signal: SignalCandidate,
    qty: number,
    contract: string,
    submittedTs: string,
    sessionExitTs: string,
    entryWindowEndTs: string
  ): PaperPositionState {
    return {
      id: randomUUID(),
      strategyId: this.config.strategyId,
      symbol: this.spec.symbol,
      contract,
      side: signal.side,
      qty,
      remainingQty: qty,
      entryPx: signal.entryPx,
      stopPx: signal.stopPx,
      targetPx: signal.targetPx,
      signalTs: signal.signalTs,
      submittedTs,
      status: "PENDING",
      breakEvenArmed: false,
      currentStopPx: signal.stopPx,
      sessionExitTs,
      entryWindowEndTs,
      lastProcessedBarTs: null
    };
  }

  tryFillPending(order: PaperOrder, entryBar: Bar): PaperOrder | null {
    const slippageTicks = this.slippageTicks(entryBar);
    const contract = order.contract || entryBar.contract;
    if (order.side === "BUY") {
      const invalidated = entryBar.low <= order.stopPx + this.spec.tickSize;
      const triggered = entryBar.high >= order.entryPx;
      if (invalidated) {
        return null;
      }
      if (!triggered) {
        return order;
      }
      const fillPx = effectivePrice(order.entryPx, "BUY", slippageTicks, this.spec.tickSize);
      return {
        ...order,
        contract,
        submittedTs: entryBar.tsUtc,
        avgFillPx: fillPx,
        filledQty: order.qty,
        status: "OPEN"
      };
    }

    const invalidated = entryBar.high >= order.stopPx - this.spec.tickSize;
    const triggered = entryBar.low <= order.entryPx;
    if (invalidated) {
      return null;
    }
    if (!triggered) {
      return order;
    }
    const fillPx = effectivePrice(order.entryPx, "SELL", slippageTicks, this.spec.tickSize);
    return {
      ...order,
      contract,
      submittedTs: entryBar.tsUtc,
      avgFillPx: fillPx,
      filledQty: order.qty,
      status: "OPEN"
    };
  }

  advancePendingOrder(
    order: PaperPositionState,
    entryBars: Bar[]
  ): { nextOrder: PaperPositionState | null; rejectedReason?: string } {
    let nextOrder = { ...order };
    for (const entryBar of entryBars) {
      if (nextOrder.lastProcessedBarTs && entryBar.tsUtc <= nextOrder.lastProcessedBarTs) {
        continue;
      }
      if (entryBar.tsUtc > nextOrder.entryWindowEndTs) {
        return { nextOrder: null, rejectedReason: "entry_not_triggered" };
      }

      const filled = this.tryFillPending(
        {
          id: nextOrder.id,
          strategyId: nextOrder.strategyId,
          symbol: nextOrder.symbol,
          contract: nextOrder.contract,
          side: nextOrder.side,
          qty: nextOrder.qty,
          entryPx: nextOrder.entryPx,
          stopPx: nextOrder.stopPx,
          targetPx: nextOrder.targetPx,
          signalTs: nextOrder.signalTs,
          submittedTs: nextOrder.submittedTs,
          status: "PENDING",
          filledQty: 0,
          breakEvenArmed: nextOrder.breakEvenArmed,
          sessionExitTs: nextOrder.sessionExitTs
        },
        entryBar
      );

      if (filled === null) {
        return { nextOrder: null, rejectedReason: "entry_invalidated" };
      }

      if (filled.status === "OPEN" && filled.avgFillPx !== undefined) {
        return {
          nextOrder: {
            ...nextOrder,
            contract: filled.contract,
            status: "OPEN",
            avgFillPx: filled.avgFillPx,
            filledTs: entryBar.tsUtc,
            submittedTs: entryBar.tsUtc,
            currentStopPx: nextOrder.stopPx,
            lastProcessedBarTs: entryBar.tsUtc
          }
        };
      }

      nextOrder = {
        ...nextOrder,
        lastProcessedBarTs: entryBar.tsUtc
      };
    }

    return {
      nextOrder:
        nextOrder.lastProcessedBarTs !== null && nextOrder.lastProcessedBarTs >= nextOrder.entryWindowEndTs ? null : nextOrder,
      rejectedReason:
        nextOrder.lastProcessedBarTs !== null && nextOrder.lastProcessedBarTs >= nextOrder.entryWindowEndTs
          ? "entry_not_triggered"
          : undefined
    };
  }

  advanceOpenPosition(
    position: PaperPositionState,
    executionBars5m: Bar[],
    trailingBars15m: Bar[]
  ): { nextPosition: PaperPositionState | null; trades: TradeRecord[] } {
    if (position.status !== "OPEN" || position.avgFillPx === undefined) {
      return { nextPosition: position, trades: [] };
    }

    const nextPosition = { ...position };
    const avgFillPx = position.avgFillPx;
    const records: TradeRecord[] = [];
    const partialQty = Math.floor(nextPosition.qty / 2);

    for (const bar of executionBars5m) {
      if (nextPosition.lastProcessedBarTs && bar.tsUtc <= nextPosition.lastProcessedBarTs) {
        continue;
      }

      if (bar.tsUtc >= nextPosition.sessionExitTs || buildSessionKey(bar.tsUtc) !== buildSessionKey(nextPosition.signalTs)) {
        records.push(
            this.buildRecord(
              nextPosition,
              nextPosition.remainingQty,
              avgFillPx,
              bar.open,
              bar.tsUtc,
              "SESSION_FLAT",
            0
          )
        );
        return { nextPosition: null, trades: records };
      }

      nextPosition.currentStopPx = this.computeTrailingStop(nextPosition, nextPosition.currentStopPx, bar.tsUtc, trailingBars15m);

      if (nextPosition.side === "BUY") {
        if (bar.low <= nextPosition.currentStopPx) {
          records.push(
            this.buildRecord(
              nextPosition,
              nextPosition.remainingQty,
              avgFillPx,
              effectivePrice(nextPosition.currentStopPx, "SELL", this.slippageTicks(bar), this.spec.tickSize),
              bar.tsUtc,
              nextPosition.breakEvenArmed || nextPosition.currentStopPx > nextPosition.stopPx ? "TRAIL" : "STOP",
              this.slippageTicks(bar)
            )
          );
          return { nextPosition: null, trades: records };
        }

        if (!nextPosition.breakEvenArmed && bar.high >= nextPosition.targetPx) {
          const qtyToClose = partialQty > 0 ? partialQty : nextPosition.remainingQty;
          records.push(
            this.buildRecord(
              nextPosition,
              qtyToClose,
              avgFillPx,
              effectivePrice(nextPosition.targetPx, "SELL", this.slippageTicks(bar), this.spec.tickSize),
              bar.tsUtc,
              "TARGET",
              this.slippageTicks(bar)
            )
          );
          nextPosition.remainingQty -= qtyToClose;
          nextPosition.breakEvenArmed = nextPosition.remainingQty > 0;
          nextPosition.currentStopPx = Math.max(avgFillPx, nextPosition.currentStopPx);
          nextPosition.lastProcessedBarTs = bar.tsUtc;
          if (nextPosition.remainingQty <= 0) {
            return { nextPosition: null, trades: records };
          }
          continue;
        }
      } else {
        if (bar.high >= nextPosition.currentStopPx) {
          records.push(
            this.buildRecord(
              nextPosition,
              nextPosition.remainingQty,
              avgFillPx,
              effectivePrice(nextPosition.currentStopPx, "BUY", this.slippageTicks(bar), this.spec.tickSize),
              bar.tsUtc,
              nextPosition.breakEvenArmed || nextPosition.currentStopPx < nextPosition.stopPx ? "TRAIL" : "STOP",
              this.slippageTicks(bar)
            )
          );
          return { nextPosition: null, trades: records };
        }

        if (!nextPosition.breakEvenArmed && bar.low <= nextPosition.targetPx) {
          const qtyToClose = partialQty > 0 ? partialQty : nextPosition.remainingQty;
          records.push(
            this.buildRecord(
              nextPosition,
              qtyToClose,
              avgFillPx,
              effectivePrice(nextPosition.targetPx, "BUY", this.slippageTicks(bar), this.spec.tickSize),
              bar.tsUtc,
              "TARGET",
              this.slippageTicks(bar)
            )
          );
          nextPosition.remainingQty -= qtyToClose;
          nextPosition.breakEvenArmed = nextPosition.remainingQty > 0;
          nextPosition.currentStopPx = Math.min(avgFillPx, nextPosition.currentStopPx);
          nextPosition.lastProcessedBarTs = bar.tsUtc;
          if (nextPosition.remainingQty <= 0) {
            return { nextPosition: null, trades: records };
          }
          continue;
        }
      }

      nextPosition.lastProcessedBarTs = bar.tsUtc;
    }

    return { nextPosition, trades: records };
  }

  closeOpenOrder(order: PaperOrder, executionBars5m: Bar[], trailingBars15m: Bar[]): TradeRecord[] {
    if (order.status !== "OPEN" || order.avgFillPx === undefined) {
      return [];
    }

    const incremental = this.advanceOpenPosition(
      {
        id: order.id,
        strategyId: order.strategyId,
        symbol: order.symbol,
        contract: order.contract,
        side: order.side,
        qty: order.qty,
        remainingQty: order.qty,
        entryPx: order.entryPx,
        stopPx: order.stopPx,
        targetPx: order.targetPx,
        signalTs: order.signalTs,
        submittedTs: order.submittedTs,
        filledTs: order.submittedTs,
        status: "OPEN",
        avgFillPx: order.avgFillPx,
        breakEvenArmed: false,
        currentStopPx: order.stopPx,
        sessionExitTs: order.sessionExitTs,
        entryWindowEndTs: order.submittedTs,
        lastProcessedBarTs: null
      },
      executionBars5m,
      trailingBars15m
    );

    if (incremental.nextPosition && executionBars5m.length > 0) {
      const lastBar = executionBars5m[executionBars5m.length - 1];
      incremental.trades.push(this.buildRecord(incremental.nextPosition, incremental.nextPosition.remainingQty, order.avgFillPx, lastBar.close, lastBar.tsUtc, "SESSION_FLAT", 0));
    }

    return incremental.trades;
  }

  private computeTrailingStop(position: PaperPositionState, currentStop: number, tsUtc: string, trailingBars15m: Bar[]): number {
    if (!position.avgFillPx) {
      return currentStop;
    }
    const eligibleBars = trailingBars15m.filter((bar) => bar.tsUtc <= tsUtc);
    if (eligibleBars.length < 3) {
      return currentStop;
    }
    const lastThree = eligibleBars.slice(-3);
    if (position.side === "BUY") {
      const swingLow = Math.min(...lastThree.map((bar) => bar.low)) - this.spec.tickSize;
      return Math.max(currentStop, swingLow);
    }
    const swingHigh = Math.max(...lastThree.map((bar) => bar.high)) + this.spec.tickSize;
    return Math.min(currentStop, swingHigh);
  }

  private buildRecord(
    position: PaperPositionState,
    qty: number,
    entryPx: number,
    exitPx: number,
    exitTs: string,
    exitReason: TradeRecord["exitReason"],
    slippageTicks: number
  ): TradeRecord {
    const grossPnl =
      position.side === "BUY"
        ? (exitPx - entryPx) * qty * this.spec.contractMultiplier
        : (entryPx - exitPx) * qty * this.spec.contractMultiplier;
    const feesUsd = qty * this.config.commissionPerContractUsd;
    const slippageUsd = tickSlippageUsd(qty, slippageTicks, this.spec.tickValue);
    return {
      id: randomUUID(),
      strategyId: position.strategyId,
      symbol: position.symbol,
      contract: position.contract,
      side: position.side,
      qty,
      entryTs: position.filledTs ?? position.submittedTs,
      exitTs,
      entryPx,
      exitPx,
      stopPx: position.stopPx,
      targetPx: position.targetPx,
      feesUsd,
      slippageUsd,
      pnlUsd: grossPnl - feesUsd - slippageUsd,
      exitReason,
      version: "0.1.0"
    };
  }

  private slippageTicks(bar: Bar): number {
    return bar.sessionLabel === "US" ? this.config.usOpenSlippageTicks : this.config.defaultSlippageTicks;
  }
}
