import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("ops-compare CLI", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("writes an operations compare artifact grouped by config and warnings", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "ops-compare-cli-"));
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
        warningCodes: ["NO_NEW_FILES"],
        researchRecommendation: "continue_paper",
        config: {
          path: "config/strategies/profile-a.json",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          summary: "profile-a"
        }
      },
      {
        name: "daily-run-2026-04-12T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-12T00:00:00.000Z",
        overallStatus: "FAIL",
        escalationLevel: "CRITICAL",
        escalationCodes: ["REPEATED_FAILS"],
        warningCodes: ["BATCH_FAILED"],
        researchRecommendation: "continue_paper",
        config: {
          path: "config/strategies/profile-a.json",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          summary: "profile-a"
        }
      },
      {
        name: "daily-run-2026-04-11T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-11T00:00:00.000Z",
        overallStatus: "WARN",
        escalationLevel: "ATTENTION",
        escalationCodes: ["PERSISTENT_NON_OK"],
        warningCodes: ["RESEARCH_MORE"],
        researchRecommendation: "research_more",
        config: {
          path: "config/strategies/profile-b.json",
          sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          summary: "profile-b"
        }
      },
      {
        name: "daily-run-2026-04-10T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-10T00:00:00.000Z",
        overallStatus: "OK",
        escalationLevel: "NONE",
        escalationCodes: [],
        warningCodes: [],
        researchRecommendation: "continue_paper",
        config: {
          path: "config/strategies/profile-c.json",
          sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          summary: "profile-c"
        }
      }
    ] as const) {
      await writeFile(
        join(dailyDir, artifact.name),
        JSON.stringify({
          generatedAtUtc: artifact.generatedAtUtc,
          batchStatus: artifact.overallStatus === "FAIL" ? "failed" : "completed",
          failedStep: artifact.overallStatus === "FAIL" ? "paper" : null,
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
              startUtc: "2026-04-10T00:00:00.000Z",
              endUtc: "2026-04-10T01:59:00.000Z"
            },
            contracts: ["H26"]
          },
          paperNewTrades: artifact.overallStatus === "OK" ? 1 : 0,
          researchRecommendation: artifact.researchRecommendation,
          researchGatePass: artifact.overallStatus !== "FAIL",
          artifactPaths: {
            batchJsonPath: null,
            paperJsonPath: null,
            researchJsonPath: null,
            dailyJsonPath: join(dailyDir, artifact.name),
            dailyMarkdownPath: null
          },
          operationsSummary: null,
          config: artifact.config,
          runProvenance: null,
          batchGeneratedAtUtc: null,
          paperGeneratedAtUtc: null,
          researchGeneratedAtUtc: null,
          historySnapshot: {
            windowSize: 4,
            okCount: artifact.overallStatus === "OK" ? 1 : 0,
            warnCount: artifact.overallStatus === "WARN" ? 1 : 0,
            failCount: artifact.overallStatus === "FAIL" ? 1 : 0,
            consecutiveFailCount: artifact.overallStatus === "FAIL" ? 2 : 0,
            consecutiveNonOkCount: artifact.overallStatus === "OK" ? 0 : 2,
            latestOkGeneratedAtUtc: "2026-04-10T00:00:00.000Z",
            latestFailGeneratedAtUtc: artifact.overallStatus === "FAIL" ? artifact.generatedAtUtc : "2026-04-12T00:00:00.000Z",
            warningCodeCounts: artifact.warningCodes.map((code) => ({ code, count: 1 })),
            escalationLevel: artifact.escalationLevel,
            escalationCodes: artifact.escalationCodes
          }
        }),
        "utf8"
      );
    }

    const output: string[] = [];
    await runCli(["ops-compare", "--artifacts-dir", artifactsDir], {
      log: (message: string) => output.push(message)
    });

    expect(output).toContain("Operations compare");
    expect(output.some((line) => line.includes("Scanned runs: 4"))).toBe(true);
    expect(output.some((line) => line.includes("Matched candidates: 3"))).toBe(true);
    expect(output.some((line) => line.includes("Min escalation: ATTENTION"))).toBe(true);
    expect(output.some((line) => line.includes("Top config hotspot: profile-a (2)"))).toBe(true);
    expect(output.some((line) => line.includes("Top warning code:"))).toBe(true);
    expect(output.some((line) => line.includes("Top failed step:"))).toBe(true);

    const opsDirFiles = await readdir(join(artifactsDir, "ops"));
    const compareJson = opsDirFiles.find((file) => file.startsWith("ops-compare-") && file.endsWith(".json"));
    const compareMd = opsDirFiles.find((file) => file.startsWith("ops-compare-") && file.endsWith(".md"));
    expect(compareJson).toBeTruthy();
    expect(compareMd).toBeTruthy();

    const json = JSON.parse(await readFile(join(artifactsDir, "ops", compareJson!), "utf8"));
    expect(json.candidateCount).toBe(3);
    expect(json.byConfig[0].summary).toBe("profile-a");
    expect(json.byConfig[0].candidateCount).toBe(2);
    expect(json.topHotspots[0].summary).toBe("profile-a");
    expect(json.byWarningCode[0].candidateCount).toBeGreaterThanOrEqual(1);
  });

  it("filters by critical escalation and config hash", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "ops-compare-filter-"));
    tempDirs.push(artifactsDir);
    const dailyDir = join(artifactsDir, "daily");
    await mkdir(dailyDir, { recursive: true });

    for (const artifact of [
      {
        name: "daily-run-2026-04-13T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-13T00:00:00.000Z",
        escalationLevel: "CRITICAL",
        config: {
          path: "config/strategies/profile-a.json",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          summary: "profile-a"
        }
      },
      {
        name: "daily-run-2026-04-12T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-12T00:00:00.000Z",
        escalationLevel: "ATTENTION",
        config: {
          path: "config/strategies/profile-a.json",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          summary: "profile-a"
        }
      },
      {
        name: "daily-run-2026-04-11T00-00-00-000Z.json",
        generatedAtUtc: "2026-04-11T00:00:00.000Z",
        escalationLevel: "CRITICAL",
        config: {
          path: "config/strategies/profile-b.json",
          sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          summary: "profile-b"
        }
      }
    ] as const) {
      await writeFile(
        join(dailyDir, artifact.name),
        JSON.stringify({
          generatedAtUtc: artifact.generatedAtUtc,
          batchStatus: "completed",
          failedStep: null,
          overallStatus: "WARN",
          warningCodes: ["NO_NEW_FILES"],
          warningMessages: [],
          healthChecks: [],
          ingestionSummary: null,
          paperNewTrades: 0,
          researchRecommendation: "research_more",
          researchGatePass: true,
          artifactPaths: {
            batchJsonPath: null,
            paperJsonPath: null,
            researchJsonPath: null,
            dailyJsonPath: join(dailyDir, artifact.name),
            dailyMarkdownPath: null
          },
          operationsSummary: null,
          config: artifact.config,
          runProvenance: null,
          batchGeneratedAtUtc: null,
          paperGeneratedAtUtc: null,
          researchGeneratedAtUtc: null,
          historySnapshot: {
            windowSize: 3,
            okCount: 0,
            warnCount: 1,
            failCount: 0,
            consecutiveFailCount: artifact.escalationLevel === "CRITICAL" ? 2 : 0,
            consecutiveNonOkCount: 2,
            latestOkGeneratedAtUtc: null,
            latestFailGeneratedAtUtc: null,
            warningCodeCounts: [{ code: "NO_NEW_FILES", count: 1 }],
            escalationLevel: artifact.escalationLevel,
            escalationCodes: artifact.escalationLevel === "CRITICAL" ? ["REPEATED_FAILS"] : ["REPEATED_NO_NEW_FILES"]
          }
        }),
        "utf8"
      );
    }

    const output: string[] = [];
    await runCli(
      ["ops-compare", "--artifacts-dir", artifactsDir, "--min-escalation", "critical", "--config-hash", "aaaaaaaa"],
      {
        log: (message: string) => output.push(message)
      }
    );

    expect(output.some((line) => line.includes("Matched candidates: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Config hash filter: aaaaaaaa"))).toBe(true);
    expect(output.some((line) => line.includes("Top config hotspot: profile-a (1)"))).toBe(true);
  });

  it("adds ops-compare artifacts to the artifact index", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "ops-compare-index-"));
    tempDirs.push(artifactsDir);
    const dailyDir = join(artifactsDir, "daily");
    await mkdir(dailyDir, { recursive: true });

    await writeFile(
      join(dailyDir, "daily-run-2026-04-13T00-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-13T00:00:00.000Z",
        batchStatus: "failed",
        failedStep: "ingest",
        overallStatus: "FAIL",
        warningCodes: ["BATCH_FAILED"],
        warningMessages: [],
        healthChecks: [],
        ingestionSummary: null,
        paperNewTrades: 0,
        researchRecommendation: "reject_current_rule_set",
        researchGatePass: false,
        artifactPaths: {
          batchJsonPath: null,
          paperJsonPath: null,
          researchJsonPath: null,
          dailyJsonPath: join(dailyDir, "daily-run-2026-04-13T00-00-00-000Z.json"),
          dailyMarkdownPath: null
        },
        operationsSummary: null,
        config: {
          path: "config/strategies/profile-a.json",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          summary: "profile-a"
        },
        runProvenance: null,
        batchGeneratedAtUtc: null,
        paperGeneratedAtUtc: null,
        researchGeneratedAtUtc: null,
        historySnapshot: {
          windowSize: 1,
          okCount: 0,
          warnCount: 0,
          failCount: 1,
          consecutiveFailCount: 2,
          consecutiveNonOkCount: 2,
          latestOkGeneratedAtUtc: null,
          latestFailGeneratedAtUtc: "2026-04-13T00:00:00.000Z",
          warningCodeCounts: [{ code: "BATCH_FAILED", count: 1 }],
          escalationLevel: "CRITICAL",
          escalationCodes: ["REPEATED_FAILS"]
        }
      }),
      "utf8"
    );

    await runCli(["ops-compare", "--artifacts-dir", artifactsDir], { log: () => undefined });

    const output: string[] = [];
    await runCli(["artifacts", "--artifacts-dir", artifactsDir, "--kind", "ops-compare"], {
      log: (message: string) => output.push(message)
    });

    expect(output.some((line) => line.includes("Ops compare reports: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Latest ops-compare: Ops Compare: 1 candidates across 1 configs"))).toBe(
      true
    );
  });
});
