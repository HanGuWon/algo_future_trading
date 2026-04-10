import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { expandHourlyShapesTo1m, buildTrendingHourShapes } from "./helpers.js";

const mockBars = expandHourlyShapesTo1m(buildTrendingHourShapes("2025-12-31T09:00:00.000Z", 24 * 10, 125));

vi.mock("../src/storage/sqliteStore.js", () => {
  return {
    SqliteStore: class MockSqliteStore {
      constructor(_dbPath: string) {}
      getBars() {
        return mockBars;
      }
      getEventWindows() {
        return [];
      }
      insertTrades() {}
      insertBars() {}
      insertEventWindows() {}
      close() {}
    }
  };
});

describe("walk-forward CLI", () => {
  it("prints a summary and writes json and markdown artifact paths", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = join(await mkdtemp(join(tmpdir(), "wf-cli-")), "artifacts");
    const output: string[] = [];

    await runCli(
      [
        "walkforward",
        "--db",
        "mock.sqlite",
        "--mode",
        "fixed",
        "--train-days",
        "6",
        "--validation-days",
        "1",
        "--test-days",
        "1",
        "--step-days",
        "20",
        "--artifacts-dir",
        artifactsDir
      ],
      {
        log: (message: string) => {
          output.push(message);
        }
      }
    );

    expect(output.some((line) => line.includes("Walk-forward complete"))).toBe(true);
    expect(output.some((line) => line.includes("Artifact JSON:"))).toBe(true);
    expect(output.some((line) => line.includes("Artifact Markdown:"))).toBe(true);
  });
});
