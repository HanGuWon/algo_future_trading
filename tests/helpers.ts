import type { Bar } from "../src/types.js";
import { getSessionLabelChicago } from "../src/utils/time.js";

interface HourShape {
  tsUtc: string;
  open: number;
  high: number;
  low: number;
  close: number;
  contract?: string;
}

export function expandHourlyShapesTo1m(shapes: HourShape[], symbol = "MNQ"): Bar[] {
  const bars: Bar[] = [];
  for (const shape of shapes) {
    const baseTs = new Date(shape.tsUtc).getTime();
    const contract = shape.contract ?? "H26";
    for (let minute = 0; minute < 60; minute += 1) {
      const ts = new Date(baseTs + minute * 60_000).toISOString();
      const priceAtMinute = interpolateMinutePrice(shape, minute);
      const nextPrice = interpolateMinutePrice(shape, Math.min(minute + 1, 59));
      const open = priceAtMinute;
      const close = nextPrice;
      const high = Math.max(open, close, minute === 45 ? shape.high : Number.NEGATIVE_INFINITY);
      const low = Math.min(open, close, minute === 10 ? shape.low : Number.POSITIVE_INFINITY);
      bars.push({
        symbol,
        contract,
        tsUtc: ts,
        open,
        high,
        low,
        close,
        volume: 1,
        sessionLabel: getSessionLabelChicago(ts)
      });
    }
  }
  return bars;
}

function interpolateMinutePrice(shape: HourShape, minute: number): number {
  if (minute <= 10) {
    return lerp(shape.open, shape.low, minute / 10);
  }
  if (minute <= 45) {
    return lerp(shape.low, shape.high, (minute - 10) / 35);
  }
  return lerp(shape.high, shape.close, (minute - 45) / 14);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function buildTrendingHourShapes(startUtc: string, hours: number, signalHourOffset?: number): HourShape[] {
  const shapes: HourShape[] = [];
  let price = 1000;
  for (let index = 0; index < hours; index += 1) {
    const ts = new Date(new Date(startUtc).getTime() + index * 60 * 60_000).toISOString();
    const open = price;
    const close = price + 2;
    const high = close + 1;
    const low = open - 1;
    shapes.push({ tsUtc: ts, open, high, low, close, contract: "H26" });
    price = close;
  }

  if (signalHourOffset !== undefined) {
    const signal = shapes[signalHourOffset];
    const prior = shapes[signalHourOffset - 1];
    signal.open = prior.close + 2;
    signal.low = prior.low - 12;
    signal.high = prior.close + 10;
    signal.close = signal.high - 0.5;

    const next = shapes[signalHourOffset + 1];
    next.open = signal.close;
    next.low = signal.close - 0.5;
    next.high = signal.high + 25;
    next.close = next.high - 1;
  }

  return shapes;
}

export function buildSidewaysHourShapes(startUtc: string, hours: number): HourShape[] {
  const shapes: HourShape[] = [];
  for (let index = 0; index < hours; index += 1) {
    const ts = new Date(new Date(startUtc).getTime() + index * 60 * 60_000).toISOString();
    const base = 1000 + (index % 4) * 0.2;
    shapes.push({
      tsUtc: ts,
      open: base,
      high: base + 0.5,
      low: base - 0.5,
      close: base + (index % 2 === 0 ? 0.1 : -0.1),
      contract: "H26"
    });
  }
  return shapes;
}
