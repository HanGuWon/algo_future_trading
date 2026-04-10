import type { Bar } from "../types.js";

export function sma(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }
  const window = values.slice(-period);
  return window.reduce((sum, value) => sum + value, 0) / period;
}

export function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function bollingerBands(values: number[], period: number, stdDevMultiplier: number): { upper: number; lower: number } | null {
  if (values.length < period) {
    return null;
  }
  const window = values.slice(-period);
  const middle = sma(window, period);
  if (middle === null) {
    return null;
  }
  const deviation = standardDeviation(window);
  return {
    upper: middle + deviation * stdDevMultiplier,
    lower: middle - deviation * stdDevMultiplier
  };
}

export function movingAverageSlope(values: number[], period: number, slopeLookback = 5): number | null {
  if (values.length < period + slopeLookback) {
    return null;
  }
  const current = sma(values, period);
  const previous = sma(values.slice(0, values.length - slopeLookback), period);
  if (current === null || previous === null) {
    return null;
  }
  return (current - previous) / slopeLookback;
}

export function averageRange(bars: Bar[], period: number): number | null {
  if (bars.length < period) {
    return null;
  }
  const window = bars.slice(-period);
  return window.reduce((sum, bar) => sum + (bar.high - bar.low), 0) / period;
}
