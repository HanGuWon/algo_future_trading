import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type { DailyRunArtifact } from "../types.js";
import type { WrittenArtifactPaths } from "./paperArtifacts.js";

export function renderDailyArtifactMarkdown(artifact: DailyRunArtifact): string {
  return [
    `# Daily Run`,
    ``,
    `- Generated: ${artifact.generatedAtUtc}`,
    `- Overall status: ${artifact.overallStatus}`,
    `- Batch status: ${artifact.batchStatus}`,
    `- Failed step: ${artifact.failedStep ?? "none"}`,
    `- Config: ${artifact.config?.path ?? "n/a"}`,
    `- Config SHA256: ${artifact.config?.sha256 ?? "n/a"}`,
    `- Git commit: ${artifact.runProvenance?.gitCommitSha ?? "n/a"}`,
    `- Node: ${artifact.runProvenance?.nodeVersion ?? "n/a"}`,
    `- DB path: ${artifact.runProvenance?.dbPath ?? "n/a"}`,
    `- Event windows used: ${artifact.runProvenance?.eventWindowCount ?? "n/a"}`,
    `- Input mode: ${artifact.runProvenance?.inputMode ?? "n/a"}`,
    `- Input path: ${artifact.runProvenance?.inputPath ?? "n/a"}`,
    `- Source range: ${artifact.runProvenance?.sourceRange ? `${artifact.runProvenance.sourceRange.startUtc} -> ${artifact.runProvenance.sourceRange.endUtc}` : "n/a"}`,
    ``,
    `## Warnings`,
    ``,
    artifact.warningCodes.length > 0 ? artifact.warningCodes.map((code) => `- ${code}`).join("\n") : `- none`,
    ``,
    `## Health Checks`,
    ``,
    `| Code | Severity | Passed | Message |`,
    `| --- | --- | --- | --- |`,
    ...artifact.healthChecks.map(
      (check) => `| ${check.code} | ${check.severity} | ${check.passed ? "yes" : "no"} | ${check.message} |`
    ),
    ``,
    `## Run Summary`,
    ``,
    `- Scanned files: ${artifact.ingestionSummary?.scannedFileCount ?? 0}`,
    `- New files: ${artifact.ingestionSummary?.newFileCount ?? 0}`,
    `- Skipped files: ${artifact.ingestionSummary?.skippedFileCount ?? 0}`,
    `- Failed files: ${artifact.ingestionSummary?.failedFileCount ?? 0}`,
    `- Inserted bars: ${artifact.ingestionSummary?.insertedBarCount ?? 0}`,
    `- Paper new trades: ${artifact.paperNewTrades ?? "n/a"}`,
    `- Research recommendation: ${artifact.researchRecommendation ?? "n/a"}`,
    `- Research gate pass: ${artifact.researchGatePass === null ? "n/a" : artifact.researchGatePass ? "yes" : "no"}`,
    ``,
    `## Artifact Paths`,
    ``,
    `- Batch JSON: ${artifact.artifactPaths.batchJsonPath ?? "n/a"}`,
    `- Paper JSON: ${artifact.artifactPaths.paperJsonPath ?? "n/a"}`,
    `- Research JSON: ${artifact.artifactPaths.researchJsonPath ?? "n/a"}`,
    `- Daily JSON: ${artifact.artifactPaths.dailyJsonPath ?? "n/a"}`,
    `- Daily Markdown: ${artifact.artifactPaths.dailyMarkdownPath ?? "n/a"}`
  ].join("\n");
}

export async function writeDailyArtifact(
  artifact: DailyRunArtifact,
  artifactsDir = DEFAULT_ARTIFACTS_DIR
): Promise<WrittenArtifactPaths> {
  const targetDir = join(artifactsDir, "daily");
  await mkdir(targetDir, { recursive: true });
  const timestamp = artifact.generatedAtUtc.replace(/[:.]/g, "-");
  const jsonPath = join(targetDir, `daily-run-${timestamp}.json`);
  const markdownPath = join(targetDir, `daily-run-${timestamp}.md`);
  const persistedArtifact: DailyRunArtifact = {
    ...artifact,
    artifactPaths: {
      ...artifact.artifactPaths,
      dailyJsonPath: jsonPath,
      dailyMarkdownPath: markdownPath
    }
  };
  await writeFile(jsonPath, JSON.stringify(persistedArtifact, null, 2), "utf8");
  await writeFile(markdownPath, renderDailyArtifactMarkdown(persistedArtifact), "utf8");
  return { jsonPath, markdownPath };
}
