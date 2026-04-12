import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SqliteStore } from "../src/storage/sqliteStore.js";
import type { Bar, ResearchReportArtifact } from "../src/types.js";

const mockResearchArtifact: ResearchReportArtifact = {
  generatedAtUtc: "2026-04-12T00:00:00.000Z",
  symbol: "MNQ",
  strategyId: "SessionFilteredTrendPullback_v1",
  runProvenance: {
    gitCommitSha: "abc123",
    nodeVersion: "v22.0.0",
    dbPath: "mock.sqlite",
    eventWindowCount: 0,
    inputMode: "none",
    inputPath: null,
    sourceRange: {
      startUtc: "2018-01-01T00:00:00.000Z",
      endUtc: "2025-12-31T23:59:59.999Z"
    }
  },
  baseline: {
    train: { slice: "train", range: { startUtc: "2018-01-01T00:00:00.000Z", endUtc: "2021-12-31T23:59:59.999Z" }, metrics: emptyMetrics(25) },
    validation: { slice: "validation", range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2022-12-31T23:59:59.999Z" }, metrics: emptyMetrics(25) },
    test: { slice: "test", range: { startUtc: "2023-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" }, metrics: emptyMetrics(25) }
  },
  walkforward: {
    mode: "grid",
    windowCount: 3,
    selectedWindowCount: 2,
    rolledUpMetrics: emptyMetrics(24),
    windows: [
      {
        id: "wf_001",
        status: "selected",
        selectedCandidateId: "fast20_slow120_score3_post60",
        selectedTestMetrics: emptyMetrics(12)
      }
    ]
  },
  sensitivity: {
    baselineCandidateId: "fast20_slow120_score3_post60",
    baselineRank: 1,
    totalCandidates: 3,
    stableCandidateCount: 3,
    topCandidates: []
  },
  eventComparison: {
    range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" },
    baselineScenario: "default",
    scenarios: [
      {
        scenario: "default",
        metrics: emptyMetrics(24),
        deltaFromBaseline: { tradeCount: 0, netPnlUsd: 0, expectancyUsd: 0, maxDrawdownUsd: 0 }
      }
    ]
  },
  gateConfig: {
    minTrades: 20,
    minSelectedWalkforwardWindows: 2,
    minExpectancyUsd: 0,
    maxDrawdownUsd: 3750
  },
  gateResults: {
    baselineTestTrades: { passed: true, actual: 25, threshold: 20 },
    walkforwardTrades: { passed: true, actual: 24, threshold: 20 },
    selectedWalkforwardWindows: { passed: true, actual: 2, threshold: 2 },
    baselineTestExpectancy: { passed: true, actual: 10, threshold: 0 },
    walkforwardExpectancy: { passed: true, actual: 10, threshold: 0 },
    baselineTestMaxDrawdown: { passed: true, actual: 2, threshold: 3750 },
    walkforwardMaxDrawdown: { passed: true, actual: 2, threshold: 3750 },
    sensitivityTopCandidatesTrades: { passed: true, threshold: 20, passingCandidates: 3, totalCandidates: 3 }
  },
  finalAssessment: {
    baseline_test_positive_expectancy: true,
    walkforward_oos_positive_expectancy: true,
    parameter_stability_pass: true,
    event_filter_dependence: "low",
    gatePass: true,
    gateFailureReasons: [],
    recommendation: "continue_paper"
  }
};

function emptyMetrics(tradeCount: number) {
  return {
    tradeCount,
    winRate: tradeCount > 0 ? 100 : 0,
    netPnlUsd: tradeCount * 10,
    expectancyUsd: tradeCount > 0 ? 10 : 0,
    profitFactor: tradeCount > 0 ? 1.5 : null,
    maxDrawdownUsd: 2,
    avgWinUsd: 10,
    avgLossUsd: 0,
    rejectedSignalCount: 0,
    sessionBreakdown: {
      ASIA: { tradeCount: 0, netPnlUsd: 0 },
      EUROPE: { tradeCount, netPnlUsd: tradeCount * 10 },
      US: { tradeCount: 0, netPnlUsd: 0 },
      CLOSED: { tradeCount: 0, netPnlUsd: 0 }
    },
    sideBreakdown: {
      BUY: { tradeCount, netPnlUsd: tradeCount * 10 },
      SELL: { tradeCount: 0, netPnlUsd: 0 }
    }
  };
}

vi.mock("../src/calendars/officialCalendarProvider.js", () => {
  return {
    OfficialCalendarProvider: class MockOfficialCalendarProvider {
      constructor(..._args: unknown[]) {}
      async syncToFile() {
        return [];
      }
    }
  };
});

vi.mock("../src/research/report.js", () => {
  return {
    ResearchReportRunner: class MockResearchReportRunner {
      constructor(..._args: unknown[]) {}
      run() {
        return mockResearchArtifact;
      }
    }
  };
});

describe("batch CLI", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("runs the local batch workflow and writes a batch artifact", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const tempDir = await mkdtemp(join(tmpdir(), "batch-cli-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "batch.sqlite");
    const artifactsDir = join(tempDir, "artifacts");
    const calendarOut = join(tempDir, "official-events.json");
    const store = new SqliteStore(dbPath);
    const seedBarHistorical: Bar = {
      symbol: "MNQ",
      contract: "H26",
      tsUtc: "2018-01-01T00:00:00.000Z",
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1,
      sessionLabel: "CLOSED"
    };
    const seedBarPaper: Bar = {
      symbol: "MNQ",
      contract: "H26",
      tsUtc: "2026-04-10T00:00:00.000Z",
      open: 101,
      high: 102,
      low: 100,
      close: 101.5,
      volume: 1,
      sessionLabel: "CLOSED"
    };
    try {
      store.insertBars("1m", [seedBarHistorical, seedBarPaper]);
      const output: string[] = [];
      await runCli(["batch", "--db", dbPath, "--artifacts-dir", artifactsDir, "--out", calendarOut], {
        log: (message: string) => {
          output.push(message);
        }
      });

      expect(output.some((line) => line.includes("Batch status: completed"))).toBe(true);
      expect(output.some((line) => line.includes("Batch artifact JSON:"))).toBe(true);

      const batchDirEntries = await readdir(join(artifactsDir, "batch"));
      expect(batchDirEntries.some((entry) => entry.endsWith(".json"))).toBe(true);
      expect((await readdir(join(artifactsDir, "paper"))).some((entry) => entry.endsWith(".json"))).toBe(true);
      expect((await readdir(join(artifactsDir, "research"))).some((entry) => entry.endsWith(".json"))).toBe(true);
      expect((await readdir(artifactsDir)).some((entry) => entry === "index.json")).toBe(true);

      const batchJson = batchDirEntries.find((entry) => entry.endsWith(".json"))!;
      const batchArtifact = JSON.parse(await readFile(join(artifactsDir, "batch", batchJson), "utf8")) as {
        status: string;
        failedStep: string | null;
        steps: Array<{ step: string; status: string }>;
      };
      expect(batchArtifact.status).toBe("completed");
      expect(batchArtifact.failedStep).toBeNull();
      expect(batchArtifact.steps.map((step) => step.step)).toEqual([
        "sync-calendars",
        "ingest",
        "paper",
        "research",
        "artifacts"
      ]);
      expect(batchArtifact.steps[1]?.status).toBe("skipped");
    } finally {
      store.close();
    }
  });

  it("runs batch with --input-dir and records ingestion summary", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const tempDir = await mkdtemp(join(tmpdir(), "batch-cli-dir-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "batch.sqlite");
    const artifactsDir = join(tempDir, "artifacts");
    const calendarOut = join(tempDir, "official-events.json");
    const inputDir = join(tempDir, "input");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(inputDir, { recursive: true });
    const store = new SqliteStore(dbPath);
    try {
      store.insertBars("1m", [{
        symbol: "MNQ",
        contract: "H26",
        tsUtc: "2018-01-01T00:00:00.000Z",
        open: 99,
        high: 100,
        low: 98,
        close: 99.5,
        volume: 1,
        sessionLabel: "CLOSED"
      }]);
    } finally {
      store.close();
    }
    await writeFile(
      join(inputDir, "mnq-2026-04-10.csv"),
      [
        "tsUtc,contract,open,high,low,close,volume",
        "2026-04-10T00:00:00.000Z,H26,100,101,99,100.5,1",
        "2026-04-10T00:01:00.000Z,H26,100.5,102,100,101.5,1"
      ].join("\n"),
      "utf8"
    );

    const output: string[] = [];
    await runCli(["batch", "--db", dbPath, "--artifacts-dir", artifactsDir, "--out", calendarOut, "--input-dir", inputDir], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Batch status: completed"))).toBe(true);
    expect(output.some((line) => line.includes("Scanned 1 CSV files"))).toBe(true);

    const batchDirEntries = await readdir(join(artifactsDir, "batch"));
    const batchJson = batchDirEntries.find((entry) => entry.endsWith(".json"))!;
    const batchArtifact = JSON.parse(await readFile(join(artifactsDir, "batch", batchJson), "utf8")) as {
      status: string;
      ingestionSummary: {
        inputMode: string;
        newFileCount: number;
        insertedBarCount: number;
      } | null;
      steps: Array<{ step: string; status: string }>;
    };
    expect(batchArtifact.status).toBe("completed");
    expect(batchArtifact.steps[1]?.status).toBe("completed");
    expect(batchArtifact.ingestionSummary?.inputMode).toBe("dir");
    expect(batchArtifact.ingestionSummary?.newFileCount).toBe(1);
    expect(batchArtifact.ingestionSummary?.insertedBarCount).toBe(2);
  });

  it("stops on paper failure and still writes a failed batch artifact", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const tempDir = await mkdtemp(join(tmpdir(), "batch-cli-fail-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "batch.sqlite");
    const artifactsDir = join(tempDir, "artifacts");
    const calendarOut = join(tempDir, "official-events.json");

    await expect(
      runCli(["batch", "--db", dbPath, "--artifacts-dir", artifactsDir, "--out", calendarOut], {
        log: () => undefined
      })
    ).rejects.toThrow("batch failed at step paper");

    const batchEntries = await readdir(join(artifactsDir, "batch"));
    expect(batchEntries.some((entry) => entry.endsWith(".json"))).toBe(true);
    const batchJson = batchEntries.find((entry) => entry.endsWith(".json"))!;
    const batchArtifact = JSON.parse(await readFile(join(artifactsDir, "batch", batchJson), "utf8")) as {
      status: string;
      failedStep: string | null;
      steps: Array<{ step: string; status: string }>;
    };
    expect(batchArtifact.status).toBe("failed");
    expect(batchArtifact.failedStep).toBe("paper");
    expect(batchArtifact.steps.some((step) => step.step === "research")).toBe(false);
    expect(batchArtifact.steps.some((step) => step.step === "artifacts")).toBe(false);
  });

  it("stops at ingest when an input directory contains a failing CSV", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const tempDir = await mkdtemp(join(tmpdir(), "batch-cli-ingest-fail-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "batch.sqlite");
    const artifactsDir = join(tempDir, "artifacts");
    const calendarOut = join(tempDir, "official-events.json");
    const inputDir = join(tempDir, "input");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(inputDir, { recursive: true });
    await writeFile(
      join(inputDir, "bad.csv"),
      [
        "tsUtc,contract,open,high,low,close,volume",
        "2026-04-10T00:00:30.000Z,H26,100,101,99,100.5,1"
      ].join("\n"),
      "utf8"
    );

    await expect(
      runCli(["batch", "--db", dbPath, "--artifacts-dir", artifactsDir, "--out", calendarOut, "--input-dir", inputDir], {
        log: () => undefined
      })
    ).rejects.toThrow("batch failed at step ingest");

    const batchEntries = await readdir(join(artifactsDir, "batch"));
    const batchJson = batchEntries.find((entry) => entry.endsWith(".json"))!;
    const batchArtifact = JSON.parse(await readFile(join(artifactsDir, "batch", batchJson), "utf8")) as {
      status: string;
      failedStep: string | null;
      steps: Array<{ step: string; status: string }>;
    };
    expect(batchArtifact.status).toBe("failed");
    expect(batchArtifact.failedStep).toBe("ingest");
    expect(batchArtifact.steps.some((step) => step.step === "paper")).toBe(false);
  });
});
