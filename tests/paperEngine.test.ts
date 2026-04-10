import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PaperEngine } from "../src/paper/paperEngine.js";
import { DEFAULT_ACCOUNT_EQUITY_USD, DEFAULT_STRATEGY_CONFIG, MNQ_SPEC } from "../src/config/defaults.js";
import { SqliteStore } from "../src/storage/sqliteStore.js";
import { buildTrendingHourShapes, expandHourlyShapesTo1m } from "./helpers.js";

describe("paper engine", () => {
  it("persists an open position across runs and exits it on later data", () => {
    const startUtc = "2026-04-10T09:00:00.000Z";
    const shapes = buildTrendingHourShapes(startUtc, 140, 125);
    const allBars = expandHourlyShapesTo1m(shapes);
    const firstRunBars = allBars.filter((bar) => bar.tsUtc <= "2026-04-15T15:59:00.000Z");
    const secondRunBars = allBars;
    const engine = new PaperEngine(
      DEFAULT_STRATEGY_CONFIG,
      MNQ_SPEC,
      DEFAULT_ACCOUNT_EQUITY_USD,
      "2026-04-10T00:00:00.000Z"
    );

    const first = engine.run(firstRunBars, [], null);
    expect(first.finalState.activePosition).not.toBeNull();
    expect(first.finalState.lastProcessedSignalTs).not.toBeNull();

    const second = engine.run(secondRunBars, [], first.finalState);
    expect(second.trades.length).toBeGreaterThan(0);
    expect(second.finalState.activePosition).toBeNull();

    const third = engine.run(secondRunBars, [], second.finalState);
    expect(third.trades.length).toBe(0);
    expect(third.finalState.lastProcessedSignalTs).toBe(second.finalState.lastProcessedSignalTs);
  });

  describe("paper persistence", () => {
    const tempDirs: string[] = [];

    afterEach(() => {
      while (tempDirs.length > 0) {
        rmSync(tempDirs.pop()!, { recursive: true, force: true });
      }
    });

    it("stores and reloads paper state in sqlite", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "mnq-paper-"));
      tempDirs.push(tempDir);
      const dbPath = join(tempDir, "paper.sqlite");

      const startUtc = "2026-04-10T09:00:00.000Z";
      const shapes = buildTrendingHourShapes(startUtc, 140, 125);
      const allBars = expandHourlyShapesTo1m(shapes);
      const firstRunBars = allBars.filter((bar) => bar.tsUtc <= "2026-04-15T15:59:00.000Z");
      const engine = new PaperEngine(
        DEFAULT_STRATEGY_CONFIG,
        MNQ_SPEC,
        DEFAULT_ACCOUNT_EQUITY_USD,
        "2026-04-10T00:00:00.000Z"
      );
      const runResult = engine.run(firstRunBars, [], null);

      const store = new SqliteStore(dbPath);
      try {
        store.upsertPaperState(runResult.finalState);
      } finally {
        store.close();
      }

      const reopened = new SqliteStore(dbPath);
      try {
        const state = reopened.getPaperState(DEFAULT_STRATEGY_CONFIG.strategyId, "MNQ");
        expect(state).not.toBeNull();
        expect(state?.processedThroughUtc).toBe(runResult.finalState.processedThroughUtc);
        expect(state?.activePosition?.status).toBe(runResult.finalState.activePosition?.status);
      } finally {
        reopened.close();
      }
    });
  });
});
