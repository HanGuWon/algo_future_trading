import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("ops-report CLI", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("writes an operations report artifact for intervention candidates", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "ops-report-cli-"));
    tempDirs.push(artifactsDir);
    const dailyDir = join(artifactsDir, "daily");
    await mkdir(dailyDir, { recursive: true });

    for (const artifact of [
      {
        name: "daily-run-2026-04-13T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-13T00:00:00.000Z",
        overallStatus: "WARN",
        escalationLevel: "ATTENTION",
        escalationCodes: ["REPEATED_NO_NEW_FILES"],
        warningCodes: ["NO_NEW_FILES"]
      },
      {
        name: "daily-run-2026-04-12T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-12T00:00:00.000Z",
        overallStatus: "OK",
        escalationLevel: "NONE",
        escalationCodes: [],
        warningCodes: []
      }
    ] as const) {
      await writeFile(
        join(dailyDir, artifact.name),
        JSON.stringify({
          generatedAtUtc: artifact.generatedAtUtc,
          batchStatus: "completed",
          failedStep: null,
          overallStatus: artifact.overallStatus,
          warningCodes: artifact.warningCodes,
          warningMessages: [],
          healthChecks: [],
          ingestionSummary: {
            inputMode: "dir",
            inputPath: "C:\\data\\mnq_drop",
            scannedFileCount: 1,
            newFileCount: artifact.overallStatus === "OK" ? 1 : 0,
            skippedFileCount: 0,
            failedFileCount: 0,
            insertedBarCount: artifact.overallStatus === "OK" ? 100 : 0,
            sourceRange: {
              startUtc: "2026-04-12T00:00:00.000Z",
              endUtc: "2026-04-12T01:59:00.000Z"
            },
            contracts: ["H26"]
          },
          paperNewTrades: artifact.overallStatus === "OK" ? 1 : 0,
          researchRecommendation: artifact.overallStatus === "OK" ? "continue_paper" : "research_more",
          researchGatePass: true,
          artifactPaths: {
            batchJsonPath: null,
            paperJsonPath: null,
            researchJsonPath: null,
            dailyJsonPath: join(dailyDir, artifact.name),
            dailyMarkdownPath: null
          },
          operationsSummary: null,
          config: {
            path: "config/strategies/session-filtered-trend-pullback-v1.json",
            sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            summary: "daily-profile"
          },
          runProvenance: null,
          batchGeneratedAtUtc: null,
          paperGeneratedAtUtc: null,
          researchGeneratedAtUtc: null,
          historySnapshot: {
            windowSize: 2,
            okCount: artifact.overallStatus === "OK" ? 1 : 0,
            warnCount: artifact.overallStatus === "WARN" ? 1 : 0,
            failCount: 0,
            consecutiveFailCount: 0,
            consecutiveNonOkCount: artifact.overallStatus === "WARN" ? 2 : 0,
            latestOkGeneratedAtUtc: "2026-04-12T00:00:00.000Z",
            latestFailGeneratedAtUtc: null,
            warningCodeCounts: artifact.warningCodes.map((code) => ({ code, count: 2 })),
            escalationLevel: artifact.escalationLevel,
            escalationCodes: artifact.escalationCodes
          }
        }),
        "utf8"
      );
    }

    const output: string[] = [];
    await runCli(["ops-report", "--artifacts-dir", artifactsDir], {
      log: (message: string) => output.push(message)
    });

    expect(output).toContain("Operations report");
    expect(output).toContain("Escalated runs");
    expect(output).toContain("Threshold: ATTENTION");
    expect(output.some((line) => line.includes("Candidate count: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Ops artifact JSON:"))).toBe(true);

    const opsDirFiles = await readdir(join(artifactsDir, "ops"));
    const jsonName = opsDirFiles.find((file) => file.endsWith(".json"));
    const mdName = opsDirFiles.find((file) => file.endsWith(".md"));
    expect(jsonName).toBeTruthy();
    expect(mdName).toBeTruthy();

    const markdown = await readFile(join(artifactsDir, "ops", mdName!), "utf8");
    expect(markdown).toContain("# Operations Report");
    expect(markdown).toContain("Candidate count: 1");
    expect(markdown).toContain("REPEATED_NO_NEW_FILES");
  });

  it("surfaces ops artifacts in the artifact index", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "ops-report-index-"));
    tempDirs.push(artifactsDir);
    const opsDir = join(artifactsDir, "ops");
    await mkdir(opsDir, { recursive: true });

    await writeFile(
      join(opsDir, "ops-report-2026-04-13T00-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-13T00:00:00.000Z",
        artifactsDir,
        windowSize: 14,
        minEscalation: "ATTENTION",
        summary: {
          latestStatus: "WARN",
          latestWarningCodes: ["NO_NEW_FILES"],
          recentRunCount: 3,
          windowSize: 3,
          okCount: 1,
          warnCount: 2,
          failCount: 0,
          consecutiveFailCount: 0,
          consecutiveNonOkCount: 2,
          latestOkGeneratedAtUtc: "2026-04-11T00:00:00.000Z",
          latestFailGeneratedAtUtc: null,
          warningCodeCounts: [{ code: "NO_NEW_FILES", count: 2 }],
          escalationLevel: "ATTENTION",
          escalationCodes: ["REPEATED_NO_NEW_FILES"]
        },
        candidateCount: 1,
        candidates: []
      }),
      "utf8"
    );
    await writeFile(join(opsDir, "ops-report-2026-04-13T00-00-00-000Z.md"), "# Operations Report", "utf8");

    const output: string[] = [];
    await runCli(["artifacts", "--artifacts-dir", artifactsDir, "--kind", "ops"], {
      log: (message: string) => output.push(message)
    });

    expect(output.some((line) => line.includes("Kind filter: ops"))).toBe(true);
    expect(output.some((line) => line.includes("Ops reports: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Latest ops: Ops: 1 candidates at ATTENTION+"))).toBe(true);
    const markdown = await readFile(join(artifactsDir, "index-ops.md"), "utf8");
    expect(markdown).toContain("Latest ops");
    expect(markdown).toContain("Ops: 1 candidates at ATTENTION+");
  });
});
