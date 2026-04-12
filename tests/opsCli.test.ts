import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("ops CLI", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("prints recent daily history without running batch", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "ops-cli-"));
    tempDirs.push(artifactsDir);
    const dailyDir = join(artifactsDir, "daily");
    await mkdir(dailyDir, { recursive: true });

    for (const artifact of [
      {
        name: "daily-run-2026-04-13T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-13T00:00:00.000Z",
        overallStatus: "FAIL",
        warningCodes: ["BATCH_FAILED"],
        latestFail: "2026-04-13T00:00:00.000Z",
        latestOk: "2026-04-11T00:00:00.000Z"
      },
      {
        name: "daily-run-2026-04-12T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-12T00:00:00.000Z",
        overallStatus: "WARN",
        warningCodes: ["NO_NEW_FILES"],
        latestFail: "2026-04-10T00:00:00.000Z",
        latestOk: "2026-04-11T00:00:00.000Z"
      },
      {
        name: "daily-run-2026-04-11T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-11T00:00:00.000Z",
        overallStatus: "OK",
        warningCodes: [],
        latestFail: null,
        latestOk: "2026-04-11T00:00:00.000Z"
      }
    ]) {
      await writeFile(
        join(dailyDir, artifact.name),
        JSON.stringify({
          generatedAtUtc: artifact.generatedAtUtc,
          batchStatus: artifact.overallStatus === "FAIL" ? "failed" : "completed",
          failedStep: artifact.overallStatus === "FAIL" ? "ingest" : null,
          overallStatus: artifact.overallStatus,
          warningCodes: artifact.warningCodes,
          warningMessages: [],
          healthChecks: [],
          ingestionSummary: null,
          paperNewTrades: artifact.overallStatus === "OK" ? 1 : 0,
          researchRecommendation: artifact.overallStatus === "FAIL" ? "research_more" : "continue_paper",
          researchGatePass: artifact.overallStatus !== "FAIL",
          artifactPaths: {
            batchJsonPath: null,
            paperJsonPath: null,
            researchJsonPath: null,
            dailyJsonPath: null,
            dailyMarkdownPath: null
          },
          operationsSummary: null,
          config: null,
          runProvenance: null,
          batchGeneratedAtUtc: null,
          paperGeneratedAtUtc: null,
          researchGeneratedAtUtc: null,
          historySnapshot: {
            windowSize: 3,
            okCount: 1,
            warnCount: 1,
            failCount: 1,
            consecutiveFailCount: artifact.overallStatus === "FAIL" ? 1 : 0,
            consecutiveNonOkCount: artifact.overallStatus === "OK" ? 0 : 2,
            latestOkGeneratedAtUtc: artifact.latestOk,
            latestFailGeneratedAtUtc: artifact.latestFail,
            warningCodeCounts: artifact.warningCodes.map((code) => ({ code, count: 1 }))
          }
        }),
        "utf8"
      );
    }

    const output: string[] = [];
    await runCli(["ops", "--artifacts-dir", artifactsDir], {
      log: (message: string) => output.push(message)
    });

    expect(output).toContain("Operations history");
    expect(output).toContain("Recent runs analyzed: 3");
    expect(output).toContain("Status counts: OK=1 WARN=1 FAIL=1");
    expect(output).toContain("Current fail streak: 1");
    expect(output).toContain("Current non-OK streak: 2");
    expect(output.some((line) => line.includes("Top warning codes:"))).toBe(true);
  });
});
