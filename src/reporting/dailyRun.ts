import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type {
  BatchRunArtifact,
  DailyEscalationCode,
  DailyEscalationLevel,
  DailyHealthCheckResult,
  DailyHealthStatus,
  DailyHistorySnapshot,
  DailyOperationsSummary,
  DailyRunArtifact,
  DailyRunSummary,
  DailyWarningCode,
  LatestArtifactPointers,
  PaperReportArtifact,
  ResearchReportArtifact,
  WarningCodeCount
} from "../types.js";

interface LatestDailyArtifacts {
  pointers: LatestArtifactPointers;
  batchArtifact: BatchRunArtifact | null;
  paperArtifact: PaperReportArtifact | null;
  researchArtifact: ResearchReportArtifact | null;
}

const DEFAULT_HISTORY_LIMIT = 14;
const REPEATED_WARNING_THRESHOLD = 2;
const PERSISTENT_NON_OK_THRESHOLD = 3;
const CRITICAL_FAIL_STREAK_THRESHOLD = 2;
const ESCALATION_LEVEL_RANK: Record<DailyEscalationLevel, number> = {
  NONE: 0,
  ATTENTION: 1,
  CRITICAL: 2
};

const WARNING_MESSAGES: Record<DailyWarningCode, string> = {
  NO_NEW_FILES: "No new CSV files were ingested in this run.",
  ZERO_INSERTED_BARS: "The ingest step completed without inserting new 1m bars.",
  INGEST_FAILED_FILES: "One or more CSV files failed during ingestion.",
  NO_NEW_PAPER_TRADES: "Paper mode completed without opening or closing any new trades.",
  RESEARCH_GATE_FAILED: "Research completed but the configured gate checks did not pass.",
  RESEARCH_MORE: "Research recommendation is research_more, so the rule set is not ready to rely on.",
  STALE_SOURCE_RANGE: "Latest source data is stale relative to the current Asia/Seoul run date.",
  BATCH_FAILED: "The batch workflow failed before all steps completed."
};

function latestByName(files: string[]): string | null {
  const sorted = [...files].sort((left, right) => right.localeCompare(left));
  return sorted[0] ?? null;
}

function sortGeneratedAtDesc<T extends { generatedAtUtc: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => right.generatedAtUtc.localeCompare(left.generatedAtUtc));
}

async function safeList(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function readJsonIfExists<T>(path: string | null): Promise<T | null> {
  if (!path) {
    return null;
  }
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function formatTimeZoneDate(value: string | Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(new Date(value));
}

function dayNumberInTimeZone(value: string | Date, timeZone: string): number {
  const [year, month, day] = formatTimeZoneDate(value, timeZone).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function isSourceRangeStale(endUtc: string | null, now: Date): boolean {
  if (!endUtc) {
    return false;
  }
  const todayKst = dayNumberInTimeZone(now, "Asia/Seoul");
  const sourceDayKst = dayNumberInTimeZone(endUtc, "Asia/Seoul");
  return todayKst - sourceDayKst > 2;
}

function buildHealthChecks(
  summary: Omit<DailyRunSummary, "overallStatus" | "warningCodes" | "warningMessages" | "healthChecks" | "operationsSummary">,
  now: Date
): DailyHealthCheckResult[] {
  const sourceEndUtc = summary.ingestionSummary?.sourceRange?.endUtc ?? null;
  return [
    {
      code: "BATCH_FAILED",
      severity: "FAIL",
      passed: summary.batchStatus === "completed",
      message: WARNING_MESSAGES.BATCH_FAILED
    },
    {
      code: "INGEST_FAILED_FILES",
      severity: "FAIL",
      passed: (summary.ingestionSummary?.failedFileCount ?? 0) === 0 && summary.failedStep !== "ingest",
      message: WARNING_MESSAGES.INGEST_FAILED_FILES
    },
    {
      code: "RESEARCH_GATE_FAILED",
      severity: "FAIL",
      passed: summary.researchGatePass !== false,
      message: WARNING_MESSAGES.RESEARCH_GATE_FAILED
    },
    {
      code: "NO_NEW_FILES",
      severity: "WARN",
      passed: (summary.ingestionSummary?.newFileCount ?? 0) > 0,
      message: WARNING_MESSAGES.NO_NEW_FILES
    },
    {
      code: "ZERO_INSERTED_BARS",
      severity: "WARN",
      passed: (summary.ingestionSummary?.insertedBarCount ?? 0) > 0,
      message: WARNING_MESSAGES.ZERO_INSERTED_BARS
    },
    {
      code: "NO_NEW_PAPER_TRADES",
      severity: "WARN",
      passed: (summary.paperNewTrades ?? 0) > 0,
      message: WARNING_MESSAGES.NO_NEW_PAPER_TRADES
    },
    {
      code: "RESEARCH_MORE",
      severity: "WARN",
      passed: summary.researchRecommendation !== "research_more",
      message: WARNING_MESSAGES.RESEARCH_MORE
    },
    {
      code: "STALE_SOURCE_RANGE",
      severity: "WARN",
      passed: !isSourceRangeStale(sourceEndUtc, now),
      message: WARNING_MESSAGES.STALE_SOURCE_RANGE
    }
  ];
}

function deriveOverallStatus(
  checks: DailyHealthCheckResult[],
  recommendation: DailyRunSummary["researchRecommendation"],
  gatePass: boolean | null
): DailyHealthStatus {
  if (checks.some((check) => check.severity === "FAIL" && !check.passed)) {
    return "FAIL";
  }
  if (recommendation === "reject_current_rule_set" || gatePass === false) {
    return "FAIL";
  }
  if (checks.some((check) => check.severity === "WARN" && !check.passed)) {
    return "WARN";
  }
  if (recommendation === "continue_paper" && gatePass === true) {
    return "OK";
  }
  return "WARN";
}

function buildWarningCodeCounts(runs: DailyRunArtifact[]): WarningCodeCount[] {
  const counts = new Map<DailyWarningCode, number>();
  for (const run of runs) {
    for (const code of run.warningCodes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return left.code.localeCompare(right.code);
    });
}

function warningCountByCode(counts: WarningCodeCount[], code: DailyWarningCode): number {
  return counts.find((item) => item.code === code)?.count ?? 0;
}

function buildEscalation(
  latestStatus: DailyHealthStatus | null,
  consecutiveFailCount: number,
  consecutiveNonOkCount: number,
  warningCodeCounts: WarningCodeCount[]
): { level: DailyEscalationLevel; codes: DailyEscalationCode[] } {
  const codes: DailyEscalationCode[] = [];

  if (consecutiveFailCount >= CRITICAL_FAIL_STREAK_THRESHOLD) {
    codes.push("REPEATED_FAILS");
  }
  if (consecutiveNonOkCount >= PERSISTENT_NON_OK_THRESHOLD) {
    codes.push("PERSISTENT_NON_OK");
  }
  if (warningCountByCode(warningCodeCounts, "NO_NEW_FILES") >= REPEATED_WARNING_THRESHOLD) {
    codes.push("REPEATED_NO_NEW_FILES");
  }
  if (warningCountByCode(warningCodeCounts, "STALE_SOURCE_RANGE") >= REPEATED_WARNING_THRESHOLD) {
    codes.push("REPEATED_STALE_SOURCE_RANGE");
  }
  if (warningCountByCode(warningCodeCounts, "RESEARCH_GATE_FAILED") >= 1) {
    codes.push("RESEARCH_GATE_REGRESSION");
  }

  const uniqueCodes = [...new Set(codes)];
  if (uniqueCodes.includes("REPEATED_FAILS") || uniqueCodes.includes("RESEARCH_GATE_REGRESSION")) {
    return {
      level: "CRITICAL",
      codes: uniqueCodes
    };
  }
  if (
    latestStatus === "FAIL" ||
    uniqueCodes.includes("PERSISTENT_NON_OK") ||
    uniqueCodes.includes("REPEATED_NO_NEW_FILES") ||
    uniqueCodes.includes("REPEATED_STALE_SOURCE_RANGE")
  ) {
    return {
      level: "ATTENTION",
      codes: uniqueCodes
    };
  }
  return {
    level: "NONE",
    codes: uniqueCodes
  };
}

export function matchesDailyEscalationThreshold(
  level: DailyEscalationLevel,
  minLevel: DailyEscalationLevel | null
): boolean {
  if (!minLevel) {
    return true;
  }
  return ESCALATION_LEVEL_RANK[level] >= ESCALATION_LEVEL_RANK[minLevel];
}

function countLeadingStatuses(runs: DailyRunArtifact[], matcher: (status: DailyHealthStatus) => boolean): number {
  let count = 0;
  for (const run of runs) {
    if (!matcher(run.overallStatus)) {
      break;
    }
    count += 1;
  }
  return count;
}

export function buildDailyOperationsSummary(
  runs: DailyRunArtifact[],
  limit = DEFAULT_HISTORY_LIMIT
): DailyOperationsSummary {
  const recentRuns = sortGeneratedAtDesc(runs).slice(0, Math.max(0, limit));
  const latest = recentRuns[0] ?? null;
  const okCount = recentRuns.filter((run) => run.overallStatus === "OK").length;
  const warnCount = recentRuns.filter((run) => run.overallStatus === "WARN").length;
  const failCount = recentRuns.filter((run) => run.overallStatus === "FAIL").length;
  const latestOkGeneratedAtUtc = recentRuns.find((run) => run.overallStatus === "OK")?.generatedAtUtc ?? null;
  const latestFailGeneratedAtUtc = recentRuns.find((run) => run.overallStatus === "FAIL")?.generatedAtUtc ?? null;
  const warningCodeCounts = buildWarningCodeCounts(recentRuns);
  const consecutiveFailCount = countLeadingStatuses(recentRuns, (status) => status === "FAIL");
  const consecutiveNonOkCount = countLeadingStatuses(recentRuns, (status) => status !== "OK");
  const escalation = buildEscalation(
    latest?.overallStatus ?? null,
    consecutiveFailCount,
    consecutiveNonOkCount,
    warningCodeCounts
  );

  return {
    latestStatus: latest?.overallStatus ?? null,
    latestWarningCodes: latest?.warningCodes ?? [],
    recentRunCount: recentRuns.length,
    windowSize: recentRuns.length,
    okCount,
    warnCount,
    failCount,
    consecutiveFailCount,
    consecutiveNonOkCount,
    latestOkGeneratedAtUtc,
    latestFailGeneratedAtUtc,
    warningCodeCounts,
    escalationLevel: escalation.level,
    escalationCodes: escalation.codes
  };
}

function toHistorySnapshot(summary: DailyOperationsSummary): DailyHistorySnapshot {
  return {
    windowSize: summary.windowSize,
    okCount: summary.okCount,
    warnCount: summary.warnCount,
    failCount: summary.failCount,
    consecutiveFailCount: summary.consecutiveFailCount,
    consecutiveNonOkCount: summary.consecutiveNonOkCount,
    latestOkGeneratedAtUtc: summary.latestOkGeneratedAtUtc,
    latestFailGeneratedAtUtc: summary.latestFailGeneratedAtUtc,
    warningCodeCounts: summary.warningCodeCounts,
    escalationLevel: summary.escalationLevel,
    escalationCodes: summary.escalationCodes
  };
}

export async function resolveRecentDailyRunArtifacts(
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  limit = DEFAULT_HISTORY_LIMIT
): Promise<DailyRunArtifact[]> {
  const dailyDir = join(artifactsDir, "daily");
  const files = await safeList(dailyDir);
  const jsonFiles = sortGeneratedAtDesc(
    files.filter((entry) => /^daily-run-.*\.json$/.test(entry)).map((entry) => ({
      generatedAtUtc: entry,
      fileName: entry
    }))
  )
    .map((entry) => entry.fileName)
    .slice(0, Math.max(0, limit));

  const artifacts = await Promise.all(
    jsonFiles.map(async (entry) => readJsonIfExists<DailyRunArtifact>(join(dailyDir, entry)))
  );
  return artifacts.filter((artifact): artifact is DailyRunArtifact => artifact !== null);
}

export async function resolveLatestDailyArtifacts(
  artifactsDir = DEFAULT_ARTIFACTS_DIR
): Promise<LatestDailyArtifacts> {
  const batchDir = join(artifactsDir, "batch");
  const paperDir = join(artifactsDir, "paper");
  const researchDir = join(artifactsDir, "research");

  const [batchFiles, paperFiles, researchFiles] = await Promise.all([
    safeList(batchDir),
    safeList(paperDir),
    safeList(researchDir)
  ]);

  const batchName = latestByName(batchFiles.filter((entry) => entry.endsWith(".json")));
  const paperName = latestByName(paperFiles.filter((entry) => entry.endsWith(".json")));
  const researchName = latestByName(researchFiles.filter((entry) => entry.endsWith(".json")));

  const pointers: LatestArtifactPointers = {
    batchJsonPath: batchName ? join(batchDir, batchName) : null,
    paperJsonPath: paperName ? join(paperDir, paperName) : null,
    researchJsonPath: researchName ? join(researchDir, researchName) : null,
    dailyJsonPath: null,
    dailyMarkdownPath: null
  };

  const [batchArtifact, paperArtifact, researchArtifact] = await Promise.all([
    readJsonIfExists<BatchRunArtifact>(pointers.batchJsonPath),
    readJsonIfExists<PaperReportArtifact>(pointers.paperJsonPath),
    readJsonIfExists<ResearchReportArtifact>(pointers.researchJsonPath)
  ]);

  return {
    pointers,
    batchArtifact,
    paperArtifact,
    researchArtifact
  };
}

export function buildDailyRunSummary(
  artifacts: LatestDailyArtifacts,
  now = new Date()
): DailyRunSummary {
  const batchArtifact = artifacts.batchArtifact;
  const paperStepCompleted = batchArtifact?.steps.some((step) => step.step === "paper" && step.status === "completed") ?? false;
  const researchStepCompleted =
    batchArtifact?.steps.some((step) => step.step === "research" && step.status === "completed") ?? false;

  const baseSummary = {
    generatedAtUtc: now.toISOString(),
    batchStatus: batchArtifact?.status ?? "failed",
    failedStep: batchArtifact?.failedStep ?? null,
    ingestionSummary: batchArtifact?.ingestionSummary ?? null,
    paperNewTrades: paperStepCompleted ? (artifacts.paperArtifact?.run.newTradeCount ?? null) : null,
    researchRecommendation: researchStepCompleted
      ? (artifacts.researchArtifact?.finalAssessment.recommendation ?? null)
      : null,
    researchGatePass: researchStepCompleted ? (artifacts.researchArtifact?.finalAssessment.gatePass ?? null) : null,
    artifactPaths: {
      batchJsonPath: artifacts.pointers.batchJsonPath,
      paperJsonPath: paperStepCompleted ? artifacts.pointers.paperJsonPath : null,
      researchJsonPath: researchStepCompleted ? artifacts.pointers.researchJsonPath : null,
      dailyJsonPath: artifacts.pointers.dailyJsonPath,
      dailyMarkdownPath: artifacts.pointers.dailyMarkdownPath
    }
  };

  const healthChecks = buildHealthChecks(baseSummary, now);
  const warningChecks = healthChecks.filter((check) => !check.passed);
  return {
    ...baseSummary,
    overallStatus: deriveOverallStatus(healthChecks, baseSummary.researchRecommendation, baseSummary.researchGatePass),
    warningCodes: warningChecks.map((check) => check.code),
    warningMessages: warningChecks.map((check) => check.message),
    healthChecks,
    operationsSummary: null
  };
}

export function buildDailyRunArtifact(
  summary: DailyRunSummary,
  artifacts: LatestDailyArtifacts,
  historySnapshot?: DailyHistorySnapshot
): DailyRunArtifact {
  return {
    ...summary,
    config:
      artifacts.batchArtifact?.config ??
      artifacts.researchArtifact?.config ??
      artifacts.paperArtifact?.config ??
      null,
    runProvenance:
      artifacts.batchArtifact?.runProvenance ??
      artifacts.researchArtifact?.runProvenance ??
      artifacts.paperArtifact?.runProvenance ??
      null,
    batchGeneratedAtUtc: artifacts.batchArtifact?.generatedAtUtc ?? null,
    paperGeneratedAtUtc: artifacts.paperArtifact?.generatedAtUtc ?? null,
    researchGeneratedAtUtc: artifacts.researchArtifact?.generatedAtUtc ?? null,
    historySnapshot
  };
}

function sourceRangeLabel(summary: DailyRunSummary): string {
  if (!summary.ingestionSummary?.sourceRange) {
    return "n/a";
  }
  return `${summary.ingestionSummary.sourceRange.startUtc} -> ${summary.ingestionSummary.sourceRange.endUtc}`;
}

function warningCodesLabel(summary: DailyRunSummary): string {
  return summary.warningCodes.length > 0 ? summary.warningCodes.join(", ") : "none";
}

function topWarningsLabel(summary: DailyOperationsSummary | null): string {
  if (!summary || summary.warningCodeCounts.length === 0) {
    return "none";
  }
  return summary.warningCodeCounts
    .slice(0, 3)
    .map((item) => `${item.code}:${item.count}`)
    .join(", ");
}

export function renderDailyOperationsSummary(summary: DailyOperationsSummary | null): string[] {
  if (!summary) {
    return ["Operations history", "Recent runs analyzed: 0", "Escalation: NONE"];
  }

  return [
    "Operations history",
    `Recent runs analyzed: ${summary.recentRunCount}`,
    `Status counts: OK=${summary.okCount} WARN=${summary.warnCount} FAIL=${summary.failCount}`,
    `Current fail streak: ${summary.consecutiveFailCount}`,
    `Current non-OK streak: ${summary.consecutiveNonOkCount}`,
    `Latest FAIL: ${summary.latestFailGeneratedAtUtc ?? "n/a"}`,
    `Latest OK: ${summary.latestOkGeneratedAtUtc ?? "n/a"}`,
    `Top warning codes: ${topWarningsLabel(summary)}`,
    `Escalation: ${summary.escalationLevel}${summary.escalationCodes.length > 0 ? ` (${summary.escalationCodes.join(", ")})` : ""}`
  ];
}

export function renderEscalatedDailyRuns(
  runs: DailyRunArtifact[],
  minLevel: DailyEscalationLevel
): string[] {
  const matchingRuns = sortGeneratedAtDesc(runs).filter((run) =>
    matchesDailyEscalationThreshold(run.historySnapshot?.escalationLevel ?? "NONE", minLevel)
  );

  const lines = ["Escalated runs", `Threshold: ${minLevel}`];
  if (matchingRuns.length === 0) {
    lines.push("Matches: none");
    return lines;
  }

  for (const run of matchingRuns) {
    const level = run.historySnapshot?.escalationLevel ?? "NONE";
    const codes = run.historySnapshot?.escalationCodes ?? [];
    lines.push(
      `${run.generatedAtUtc} | status=${run.overallStatus} | escalation=${level}${
        codes.length > 0 ? ` (${codes.join(", ")})` : ""
      }`
    );
  }

  return lines;
}

export function renderDailyRunSummary(summary: DailyRunSummary): string[] {
  return [
    "Daily run summary",
    `Overall status: ${summary.overallStatus}`,
    `Batch status: ${summary.batchStatus}`,
    `Failed step: ${summary.failedStep ?? "none"}`,
    `Warning codes: ${warningCodesLabel(summary)}`,
    `Scanned files: ${summary.ingestionSummary?.scannedFileCount ?? 0}`,
    `New files: ${summary.ingestionSummary?.newFileCount ?? 0}`,
    `Skipped files: ${summary.ingestionSummary?.skippedFileCount ?? 0}`,
    `Failed files: ${summary.ingestionSummary?.failedFileCount ?? 0}`,
    `Inserted bars: ${summary.ingestionSummary?.insertedBarCount ?? 0}`,
    `Source range: ${sourceRangeLabel(summary)}`,
    `Paper new trades: ${summary.paperNewTrades ?? "n/a"}`,
    `Research recommendation: ${summary.researchRecommendation ?? "n/a"}`,
    `Research gate pass: ${
      summary.researchGatePass === null ? "n/a" : summary.researchGatePass ? "yes" : "no"
    }`,
    `Batch artifact JSON: ${summary.artifactPaths.batchJsonPath ?? "n/a"}`,
    `Paper artifact JSON: ${summary.artifactPaths.paperJsonPath ?? "n/a"}`,
    `Research artifact JSON: ${summary.artifactPaths.researchJsonPath ?? "n/a"}`,
    `Daily artifact JSON: ${summary.artifactPaths.dailyJsonPath ?? "n/a"}`,
    `Daily artifact Markdown: ${summary.artifactPaths.dailyMarkdownPath ?? "n/a"}`,
    ...renderDailyOperationsSummary(summary.operationsSummary)
  ];
}

export function withDailyOperationsSummary(
  summary: DailyRunSummary,
  runs: DailyRunArtifact[],
  limit = DEFAULT_HISTORY_LIMIT
): DailyRunSummary {
  return {
    ...summary,
    operationsSummary: buildDailyOperationsSummary(runs, limit)
  };
}

export function buildHistorySnapshotFromRuns(
  runs: DailyRunArtifact[],
  limit = DEFAULT_HISTORY_LIMIT
): DailyHistorySnapshot {
  return toHistorySnapshot(buildDailyOperationsSummary(runs, limit));
}
