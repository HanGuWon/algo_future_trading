import type { Bar, CandleType } from "../types.js";

export function classifyCandle(bar: Bar): CandleType {
  const body = Math.abs(bar.close - bar.open);
  const range = Math.max(bar.high - bar.low, Number.EPSILON);
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const bodyRatio = body / range;

  if (bodyRatio <= 0.15) {
    return "DOJI";
  }

  if (lowerWick / range >= 0.5 && upperWick / range <= 0.2 && bar.close > bar.open) {
    return "HAMMER";
  }

  if (upperWick / range >= 0.5 && lowerWick / range <= 0.2 && bar.close < bar.open) {
    return "SHOOTING_STAR";
  }

  if (lowerWick / range >= 0.4 && bar.close >= bar.open) {
    return "BULLISH_REJECTION";
  }

  if (upperWick / range >= 0.4 && bar.close <= bar.open) {
    return "BEARISH_REJECTION";
  }

  return "NONE";
}

export function isBullishReversal(candleType: CandleType): boolean {
  return candleType === "HAMMER" || candleType === "BULLISH_REJECTION" || candleType === "DOJI";
}

export function isBearishReversal(candleType: CandleType): boolean {
  return candleType === "SHOOTING_STAR" || candleType === "BEARISH_REJECTION" || candleType === "DOJI";
}
