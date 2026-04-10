import { describe, expect, it } from "vitest";
import { BacktestEngine } from "../src/backtest/engine.js";
import { expandEventWindow } from "../src/calendars/eventWindows.js";
import { DEFAULT_STRATEGY_CONFIG, MNQ_SPEC } from "../src/config/defaults.js";
import { buildSidewaysHourShapes, buildTrendingHourShapes, expandHourlyShapesTo1m } from "./helpers.js";

describe("backtest engine scenarios", () => {
  it("takes a valid trend pullback trade on a clean day", () => {
    const startUtc = "2025-12-31T09:00:00.000Z";
    const shapes = buildTrendingHourShapes(startUtc, 140, 125);
    const rawBars = expandHourlyShapesTo1m(shapes);
    const engine = new BacktestEngine(DEFAULT_STRATEGY_CONFIG, MNQ_SPEC, 25_000);
    const result = engine.run(rawBars, []);
    expect(result.trades.length).toBeGreaterThan(0);
  });

  it("produces no trades when the same setup is blocked by an event window", () => {
    const startUtc = "2025-12-31T09:00:00.000Z";
    const shapes = buildTrendingHourShapes(startUtc, 140, 125);
    const rawBars = expandHourlyShapesTo1m(shapes);
    const engine = new BacktestEngine(DEFAULT_STRATEGY_CONFIG, MNQ_SPEC, 25_000);
    const blockedWindow = expandEventWindow("EMPLOYMENT", shapes[125].tsUtc, 30, 60, "bls");
    const result = engine.run(rawBars, [blockedWindow]);
    expect(result.trades.length).toBe(0);
  });

  it("stays flat on a sideways balance regime", () => {
    const startUtc = "2025-12-31T09:00:00.000Z";
    const shapes = buildSidewaysHourShapes(startUtc, 140);
    const rawBars = expandHourlyShapesTo1m(shapes);
    const engine = new BacktestEngine(DEFAULT_STRATEGY_CONFIG, MNQ_SPEC, 25_000);
    const result = engine.run(rawBars, []);
    expect(result.trades.length).toBe(0);
  });
});
