import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type {
  DailyEscalationLevel,
  DailyInterventionCandidate,
  DailyRunArtifact,
  OperationsCompareArtifact,
  OpsCompareConfigSummary,
  OpsCompareFailedStepSummary,
  OpsCompareRecommendationSummary,
  OpsCompareWarningSummary
} from "../types.js";
import { buildInterventionCandidates } from "./dailyRun.js";
import type { WrittenArtifactPaths } from "./paperArtifacts.js";

function sortByCountThenTime(
  leftCount: number,
  rightCount: number,
  leftTime: string,
  rightTime: string,
  tieBreaker: string,
  compareTo: string
): number {
  if (leftCount !== rightCount) {
    return rightCount - leftCount;
  }
  if (leftTime !== rightTime) {
    return rightTime.localeCompare(leftTime);
  }
  return tieBreaker.localeCompare(compareTo);
}

function countStatuses(candidates: DailyInterventionCandidate[]) {
  return {
    OK: candidates.filter((candidate) => candidate.overallStatus === "OK").length,
    WARN: candidates.filter((candidate) => candidate.overallStatus === "WARN").length,
    FAIL: candidates.filter((candidate) => candidate.overallStatus === "FAIL").length
  };
}

function countEscalations(candidates: DailyInterventionCandidate[]) {
  return {
    ATTENTION: candidates.filter((candidate) => candidate.escalationLevel === "ATTENTION").length,
    CRITICAL: candidates.filter((candidate) => candidate.escalationLevel === "CRITICAL").length
  };
}

function buildByConfig(candidates: DailyInterventionCandidate[]): OpsCompareConfigSummary[] {
  const grouped = new Map<string, DailyInterventionCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.config) {
      continue;
    }
    const group = grouped.get(candidate.config.sha256) ?? [];
    group.push(candidate);
    grouped.set(candidate.config.sha256, group);
  }

  return [...grouped.entries()]
    .map(([sha256, group]) => {
      const config = group[0]!.config!;
      const warningCounts = new Map<string, number>();
      for (const candidate of group) {
        for (const code of candidate.warningCodes) {
          warningCounts.set(code, (warningCounts.get(code) ?? 0) + 1);
        }
      }

      const topWarningCodes = [...warningCounts.entries()]
        .map(([code, count]) => ({ code: code as DailyInterventionCandidate["warningCodes"][number], count }))
        .sort((left, right) => {
          if (left.count !== right.count) {
            return right.count - left.count;
          }
          return left.code.localeCompare(right.code);
        })
        .slice(0, 5);

      return {
        sha256,
        summary: config.summary,
        path: config.path,
        candidateCount: group.length,
        lastSeenGeneratedAtUtc: group[0]!.generatedAtUtc,
        statusCounts: countStatuses(group),
        escalationCounts: countEscalations(group),
        topWarningCodes,
        latestRecommendation:
          (group[0]!.researchRecommendation ?? "n/a") as OpsCompareConfigSummary["latestRecommendation"],
        latestFailedStep: (group[0]!.failedStep ?? "none") as OpsCompareConfigSummary["latestFailedStep"]
      };
    })
    .sort((left, right) =>
      sortByCountThenTime(
        left.candidateCount,
        right.candidateCount,
        left.lastSeenGeneratedAtUtc,
        right.lastSeenGeneratedAtUtc,
        left.sha256,
        right.sha256
      )
    );
}

function buildByWarningCode(candidates: DailyInterventionCandidate[]): OpsCompareWarningSummary[] {
  const grouped = new Map<string, DailyInterventionCandidate[]>();
  for (const candidate of candidates) {
    for (const code of candidate.warningCodes) {
      const group = grouped.get(code) ?? [];
      group.push(candidate);
      grouped.set(code, group);
    }
  }

  return [...grouped.entries()]
    .map(([code, group]) => {
      const configMap = new Map<string, DailyInterventionCandidate["config"]>();
      for (const candidate of group) {
        if (candidate.config) {
          configMap.set(candidate.config.sha256, candidate.config);
        }
      }
      return {
        code: code as DailyInterventionCandidate["warningCodes"][number],
        candidateCount: group.length,
        latestSeenGeneratedAtUtc: group[0]!.generatedAtUtc,
        uniqueConfigCount: configMap.size,
        configs: [...configMap.values()].filter((item): item is NonNullable<typeof item> => item !== null)
      };
    })
    .sort((left, right) =>
      sortByCountThenTime(
        left.candidateCount,
        right.candidateCount,
        left.latestSeenGeneratedAtUtc,
        right.latestSeenGeneratedAtUtc,
        left.code,
        right.code
      )
    );
}

function buildByFailedStep(candidates: DailyInterventionCandidate[]): OpsCompareFailedStepSummary[] {
  const grouped = new Map<string, DailyInterventionCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.failedStep ?? "none";
    const group = grouped.get(key) ?? [];
    group.push(candidate);
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .map(([failedStep, group]) => ({
      failedStep: failedStep as OpsCompareFailedStepSummary["failedStep"],
      candidateCount: group.length,
      latestSeenGeneratedAtUtc: group[0]!.generatedAtUtc
    }))
    .sort((left, right) =>
      sortByCountThenTime(
        left.candidateCount,
        right.candidateCount,
        left.latestSeenGeneratedAtUtc,
        right.latestSeenGeneratedAtUtc,
        left.failedStep ?? "none",
        right.failedStep ?? "none"
      )
    );
}

function buildByRecommendation(candidates: DailyInterventionCandidate[]): OpsCompareRecommendationSummary[] {
  const grouped = new Map<string, DailyInterventionCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.researchRecommendation ?? "n/a";
    const group = grouped.get(key) ?? [];
    group.push(candidate);
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .map(([recommendation, group]) => ({
      recommendation: recommendation as OpsCompareRecommendationSummary["recommendation"],
      candidateCount: group.length,
      latestSeenGeneratedAtUtc: group[0]!.generatedAtUtc
    }))
    .sort((left, right) =>
      sortByCountThenTime(
        left.candidateCount,
        right.candidateCount,
        left.latestSeenGeneratedAtUtc,
        right.latestSeenGeneratedAtUtc,
        left.recommendation,
        right.recommendation
      )
    );
}

export function buildOperationsCompareArtifact(
  runs: DailyRunArtifact[],
  {
    artifactsDir = DEFAULT_ARTIFACTS_DIR,
    limit = 30,
    minEscalation = "ATTENTION" as DailyEscalationLevel,
    configHashFilter = null as string | null
  } = {}
): OperationsCompareArtifact {
  const scannedRuns = runs.slice(0, Math.max(0, limit));
  const candidates = buildInterventionCandidates(scannedRuns, minEscalation).filter(
    (candidate) => !configHashFilter || (candidate.config?.sha256.startsWith(configHashFilter) ?? false)
  );
  const byConfig = buildByConfig(candidates);

  return {
    generatedAtUtc: new Date().toISOString(),
    artifactsDir,
    windowSize: limit,
    minEscalation,
    configHashFilter,
    scannedRunCount: scannedRuns.length,
    candidateCount: candidates.length,
    statusCounts: countStatuses(candidates),
    escalationCounts: countEscalations(candidates),
    byConfig,
    byWarningCode: buildByWarningCode(candidates),
    byFailedStep: buildByFailedStep(candidates),
    byRecommendation: buildByRecommendation(candidates),
    topHotspots: byConfig.slice(0, 5)
  };
}

export function renderOperationsCompareMarkdown(artifact: OperationsCompareArtifact): string {
  return [
    "# Operations Compare",
    "",
    `- Generated: ${artifact.generatedAtUtc}`,
    `- Artifacts dir: ${artifact.artifactsDir}`,
    `- Window size: ${artifact.windowSize}`,
    `- Minimum escalation: ${artifact.minEscalation}`,
    `- Config hash filter: ${artifact.configHashFilter ?? "none"}`,
    `- Scanned runs: ${artifact.scannedRunCount}`,
    `- Matched candidates: ${artifact.candidateCount}`,
    "",
    "## Summary",
    "",
    `- Status counts: OK=${artifact.statusCounts.OK} WARN=${artifact.statusCounts.WARN} FAIL=${artifact.statusCounts.FAIL}`,
    `- Escalation counts: ATTENTION=${artifact.escalationCounts.ATTENTION} CRITICAL=${artifact.escalationCounts.CRITICAL}`,
    `- Top config hotspot: ${artifact.topHotspots[0] ? `${artifact.topHotspots[0].summary} (${artifact.topHotspots[0].candidateCount})` : "none"}`,
    `- Top warning code: ${artifact.byWarningCode[0] ? `${artifact.byWarningCode[0].code} (${artifact.byWarningCode[0].candidateCount})` : "none"}`,
    `- Top failed step: ${artifact.byFailedStep[0] ? `${artifact.byFailedStep[0].failedStep} (${artifact.byFailedStep[0].candidateCount})` : "none"}`,
    "",
    "## Top Hotspots",
    "",
    ...(artifact.topHotspots.length === 0
      ? ["- none"]
      : artifact.topHotspots.map(
          (item) =>
            `- ${item.summary} (${item.sha256.slice(0, 12)}): ${item.candidateCount} candidates, latest ${item.lastSeenGeneratedAtUtc}`
        )),
    "",
    "## Warning Codes",
    "",
    ...(artifact.byWarningCode.length === 0
      ? ["- none"]
      : artifact.byWarningCode.map(
          (item) =>
            `- ${item.code}: ${item.candidateCount} candidates across ${item.uniqueConfigCount} configs, latest ${item.latestSeenGeneratedAtUtc}`
        )),
    "",
    "## Failed Steps",
    "",
    ...(artifact.byFailedStep.length === 0
      ? ["- none"]
      : artifact.byFailedStep.map(
          (item) => `- ${item.failedStep}: ${item.candidateCount}, latest ${item.latestSeenGeneratedAtUtc}`
        )),
    "",
    "## Recommendations",
    "",
    ...(artifact.byRecommendation.length === 0
      ? ["- none"]
      : artifact.byRecommendation.map(
          (item) => `- ${item.recommendation}: ${item.candidateCount}, latest ${item.latestSeenGeneratedAtUtc}`
        ))
  ].join("\n");
}

export async function writeOperationsCompareArtifact(
  artifact: OperationsCompareArtifact,
  artifactsDir = DEFAULT_ARTIFACTS_DIR
): Promise<WrittenArtifactPaths> {
  const targetDir = join(artifactsDir, "ops");
  await mkdir(targetDir, { recursive: true });
  const timestamp = artifact.generatedAtUtc.replace(/[:.]/g, "-");
  const jsonPath = join(targetDir, `ops-compare-${timestamp}.json`);
  const markdownPath = join(targetDir, `ops-compare-${timestamp}.md`);
  await writeFile(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
  await writeFile(markdownPath, renderOperationsCompareMarkdown(artifact), "utf8");
  return { jsonPath, markdownPath };
}
