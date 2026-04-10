import { randomUUID } from "node:crypto";
import type { Bar, InstrumentSpec, PaperOrder, SignalCandidate, StrategyConfig, TradeRecord } from "../types.js";
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

  closeOpenOrder(order: PaperOrder, executionBars5m: Bar[], trailingBars15m: Bar[]): TradeRecord[] {
    if (order.status !== "OPEN" || order.avgFillPx === undefined) {
      return [];
    }

    let remainingQty = order.qty;
    let stopPx = order.stopPx;
    let breakEvenArmed = false;
    const records: TradeRecord[] = [];
    const partialQty = Math.floor(order.qty / 2);

    for (const bar of executionBars5m) {
      if (bar.tsUtc < order.submittedTs) {
        continue;
      }

      if (bar.tsUtc >= order.sessionExitTs || buildSessionKey(bar.tsUtc) !== buildSessionKey(order.signalTs)) {
        records.push(this.buildRecord(order, remainingQty, order.avgFillPx, bar.open, bar.tsUtc, "SESSION_FLAT", 0));
        return records;
      }

      const trailingStop = this.computeTrailingStop(order, stopPx, bar.tsUtc, trailingBars15m);
      stopPx = trailingStop;

      if (order.side === "BUY") {
        if (bar.low <= stopPx) {
          records.push(
            this.buildRecord(order, remainingQty, order.avgFillPx, effectivePrice(stopPx, "SELL", this.slippageTicks(bar), this.spec.tickSize), bar.tsUtc, breakEvenArmed ? "TRAIL" : "STOP", this.slippageTicks(bar))
          );
          return records;
        }

        if (!breakEvenArmed && bar.high >= order.targetPx) {
          const qtyToClose = partialQty > 0 ? partialQty : remainingQty;
          records.push(
            this.buildRecord(
              order,
              qtyToClose,
              order.avgFillPx,
              effectivePrice(order.targetPx, "SELL", this.slippageTicks(bar), this.spec.tickSize),
              bar.tsUtc,
              "TARGET",
              this.slippageTicks(bar)
            )
          );
          remainingQty -= qtyToClose;
          breakEvenArmed = remainingQty > 0;
          stopPx = Math.max(order.avgFillPx, stopPx);
          if (remainingQty <= 0) {
            return records;
          }
        }
      } else {
        if (bar.high >= stopPx) {
          records.push(
            this.buildRecord(order, remainingQty, order.avgFillPx, effectivePrice(stopPx, "BUY", this.slippageTicks(bar), this.spec.tickSize), bar.tsUtc, breakEvenArmed ? "TRAIL" : "STOP", this.slippageTicks(bar))
          );
          return records;
        }

        if (!breakEvenArmed && bar.low <= order.targetPx) {
          const qtyToClose = partialQty > 0 ? partialQty : remainingQty;
          records.push(
            this.buildRecord(
              order,
              qtyToClose,
              order.avgFillPx,
              effectivePrice(order.targetPx, "BUY", this.slippageTicks(bar), this.spec.tickSize),
              bar.tsUtc,
              "TARGET",
              this.slippageTicks(bar)
            )
          );
          remainingQty -= qtyToClose;
          breakEvenArmed = remainingQty > 0;
          stopPx = Math.min(order.avgFillPx, stopPx);
          if (remainingQty <= 0) {
            return records;
          }
        }
      }
    }

    const lastBar = executionBars5m[executionBars5m.length - 1];
    if (remainingQty > 0 && lastBar) {
      records.push(this.buildRecord(order, remainingQty, order.avgFillPx, lastBar.close, lastBar.tsUtc, "SESSION_FLAT", 0));
    }
    return records;
  }

  private computeTrailingStop(order: PaperOrder, currentStop: number, tsUtc: string, trailingBars15m: Bar[]): number {
    if (!order.avgFillPx) {
      return currentStop;
    }
    const eligibleBars = trailingBars15m.filter((bar) => bar.tsUtc <= tsUtc);
    if (eligibleBars.length < 3) {
      return currentStop;
    }
    const lastThree = eligibleBars.slice(-3);
    if (order.side === "BUY") {
      const swingLow = Math.min(...lastThree.map((bar) => bar.low)) - this.spec.tickSize;
      return Math.max(currentStop, swingLow);
    }
    const swingHigh = Math.max(...lastThree.map((bar) => bar.high)) + this.spec.tickSize;
    return Math.min(currentStop, swingHigh);
  }

  private buildRecord(
    order: PaperOrder,
    qty: number,
    entryPx: number,
    exitPx: number,
    exitTs: string,
    exitReason: TradeRecord["exitReason"],
    slippageTicks: number
  ): TradeRecord {
    const grossPnl =
      order.side === "BUY" ? (exitPx - entryPx) * qty * this.spec.contractMultiplier : (entryPx - exitPx) * qty * this.spec.contractMultiplier;
    const feesUsd = qty * this.config.commissionPerContractUsd;
    const slippageUsd = tickSlippageUsd(qty, slippageTicks, this.spec.tickValue);
    return {
      id: randomUUID(),
      strategyId: order.strategyId,
      symbol: order.symbol,
      contract: order.contract,
      side: order.side,
      qty,
      entryTs: order.submittedTs,
      exitTs,
      entryPx,
      exitPx,
      stopPx: order.stopPx,
      targetPx: order.targetPx,
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
