import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type { OperationsReportArtifact } from "../types.js";
import type { WrittenArtifactPaths } from "./paperArtifacts.js";

export function renderOpsArtifactMarkdown(artifact: OperationsReportArtifact): string {
  return [
    "# Operations Report",
    "",
    `- Generated: ${artifact.generatedAtUtc}`,
    `- Artifacts dir: ${artifact.artifactsDir}`,
    `- Window size: ${artifact.windowSize}`,
    `- Minimum escalation: ${artifact.minEscalation}`,
    `- Candidate count: ${artifact.candidateCount}`,
    "",
    "## Summary",
    "",
    `- Latest status: ${artifact.summary.latestStatus ?? "n/a"}`,
    `- Latest warning codes: ${artifact.summary.latestWarningCodes.length > 0 ? artifact.summary.latestWarningCodes.join(", ") : "none"}`,
    `- Status counts: OK=${artifact.summary.okCount} WARN=${artifact.summary.warnCount} FAIL=${artifact.summary.failCount}`,
    `- Consecutive FAIL streak: ${artifact.summary.consecutiveFailCount}`,
    `- Consecutive non-OK streak: ${artifact.summary.consecutiveNonOkCount}`,
    `- Latest OK: ${artifact.summary.latestOkGeneratedAtUtc ?? "n/a"}`,
    `- Latest FAIL: ${artifact.summary.latestFailGeneratedAtUtc ?? "n/a"}`,
    `- Top warning codes: ${
      artifact.summary.warningCodeCounts.length > 0
        ? artifact.summary.warningCodeCounts.slice(0, 5).map((item) => `${item.code}:${item.count}`).join(", ")
        : "none"
    }`,
    `- Escalation: ${artifact.summary.escalationLevel}${
      artifact.summary.escalationCodes.length > 0 ? ` (${artifact.summary.escalationCodes.join(", ")})` : ""
    }`,
    "",
    "## Intervention Candidates",
    "",
    ...(artifact.candidates.length === 0
      ? ["- none"]
      : artifact.candidates.flatMap((candidate) => [
          `### ${candidate.generatedAtUtc}`,
          "",
          `- Overall status: ${candidate.overallStatus}`,
          `- Escalation: ${candidate.escalationLevel}${
            candidate.escalationCodes.length > 0 ? ` (${candidate.escalationCodes.join(", ")})` : ""
          }`,
          `- Warning codes: ${candidate.warningCodes.length > 0 ? candidate.warningCodes.join(", ") : "none"}`,
          `- Failed step: ${candidate.failedStep ?? "none"}`,
          `- Research recommendation: ${candidate.researchRecommendation ?? "n/a"}`,
          `- Config: ${candidate.config?.summary ?? "n/a"}`,
          `- Source range: ${candidate.sourceRange ? `${candidate.sourceRange.startUtc} -> ${candidate.sourceRange.endUtc}` : "n/a"}`,
          `- Daily JSON: ${candidate.artifactPaths.dailyJsonPath ?? "n/a"}`,
          ""
        ]))
  ].join("\n");
}

export async function writeOpsArtifact(
  artifact: OperationsReportArtifact,
  artifactsDir = DEFAULT_ARTIFACTS_DIR
): Promise<WrittenArtifactPaths> {
  const targetDir = join(artifactsDir, "ops");
  await mkdir(targetDir, { recursive: true });
  const timestamp = artifact.generatedAtUtc.replace(/[:.]/g, "-");
  const jsonPath = join(targetDir, `ops-report-${timestamp}.json`);
  const markdownPath = join(targetDir, `ops-report-${timestamp}.md`);
  await writeFile(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
  await writeFile(markdownPath, renderOpsArtifactMarkdown(artifact), "utf8");
  return { jsonPath, markdownPath };
}
