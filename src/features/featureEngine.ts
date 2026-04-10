import type { Bar, FeatureSnapshot, StrategyConfig } from "../types.js";
import { classifyCandle, isBearishReversal, isBullishReversal } from "./candles.js";
import { bollingerBands, movingAverageSlope, sma } from "./indicators.js";
import { buildPivotCluster } from "./pivotClusters.js";
import { getSessionStateAt } from "./sessionState.js";

export class FeatureEngine {
  constructor(private readonly bars1hBySymbol: Map<string, Bar[]>, private readonly config: StrategyConfig) {}

  buildSnapshot(symbol: string, tsUtc: string): FeatureSnapshot {
    const bars = this.bars1hBySymbol.get(symbol) ?? [];
    const index = bars.findIndex((bar) => bar.tsUtc === tsUtc);
    if (index === -1) {
      throw new Error(`No 1h bar found for ${symbol} at ${tsUtc}`);
    }
    return this.buildSnapshotByIndex(symbol, index);
  }

  buildSnapshotByIndex(symbol: string, index: number): FeatureSnapshot {
    const bars = this.bars1hBySymbol.get(symbol) ?? [];
    const bar = bars[index];
    if (!bar) {
      throw new Error(`No 1h bar found for ${symbol} at index ${index}`);
    }

    const closes = bars.slice(0, index + 1).map((candidate) => candidate.close);
    const ma20 = sma(closes, this.config.maFast);
    const ma120 = sma(closes, this.config.maSlow);
    const maSlope = movingAverageSlope(closes, this.config.maFast);
    const bands = bollingerBands(closes, this.config.bollingerPeriod, this.config.bollingerStdDev);
    const candleType = classifyCandle(bar);
    const sessionState = getSessionStateAt(bars, index);
    const pivotCluster = buildPivotCluster(bars, index);

    const longReasons: string[] = [];
    const shortReasons: string[] = [];

    if (bands && bar.low <= bands.lower) {
      longReasons.push("bollinger_pullback");
    }
    if (bands && bar.high >= bands.upper) {
      shortReasons.push("bollinger_pullback");
    }
    if (ma20 !== null && ma120 !== null && maSlope !== null && ma20 > ma120 && maSlope > 0) {
      longReasons.push("ma_alignment");
    }
    if (ma20 !== null && ma120 !== null && maSlope !== null && ma20 < ma120 && maSlope < 0) {
      shortReasons.push("ma_alignment");
    }
    if (isBullishReversal(candleType)) {
      longReasons.push("reversal_candle");
    }
    if (isBearishReversal(candleType)) {
      shortReasons.push("reversal_candle");
    }
    if (sessionState.breakState === "ABOVE_PREV_HIGH") {
      longReasons.push("session_break_context");
    }
    if (sessionState.breakState === "BELOW_PREV_LOW") {
      shortReasons.push("session_break_context");
    }
    if (pivotCluster.support !== null && Math.abs(bar.low - pivotCluster.support) <= 2) {
      longReasons.push("pivot_cluster");
    }
    if (pivotCluster.resistance !== null && Math.abs(bar.high - pivotCluster.resistance) <= 2) {
      shortReasons.push("pivot_cluster");
    }

    const longScore = longReasons.length;
    const shortScore = shortReasons.length;
    const directionBias = longScore === shortScore ? null : longScore > shortScore ? "BUY" : "SELL";
    const confluenceScore = directionBias === "BUY" ? longScore : directionBias === "SELL" ? shortScore : longScore;

    return {
      symbol,
      tsUtc: bar.tsUtc,
      ma20,
      ma120,
      maSlope,
      bbUpper: bands?.upper ?? null,
      bbLower: bands?.lower ?? null,
      candleType,
      confluenceScore,
      directionBias,
      support: pivotCluster.support,
      resistance: pivotCluster.resistance,
      sessionState,
      longReasons,
      shortReasons,
      pivotCluster
    };
  }
}
