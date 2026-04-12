import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type {
  BatchRunArtifact,
  DailyHealthCheckResult,
  DailyHealthStatus,
  DailyRunArtifact,
  DailyRunSummary,
  DailyWarningCode,
  LatestArtifactPointers,
  PaperReportArtifact,
  ResearchReportArtifact
} from "../types.js";

interface LatestDailyArtifacts {
  pointers: LatestArtifactPointers;
  batchArtifact: BatchRunArtifact | null;
  paperArtifact: PaperReportArtifact | null;
  researchArtifact: ResearchReportArtifact | null;
}

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

function buildHealthChecks(summary: Omit<DailyRunSummary, "overallStatus" | "warningCodes" | "warningMessages" | "healthChecks">, now: Date): DailyHealthCheckResult[] {
  const sourceEndUtc = summary.ingestionSummary?.sourceRange?.endUtc ?? null;
  const checks: DailyHealthCheckResult[] = [
    {
      code: "BATCH_FAILED",
      severity: "FAIL",
      passed: summary.batchStatus === "completed",
      message: WARNING_MESSAGES.BATCH_FAILED
    },
    {
      code: "INGEST_FAILED_FILES",
      severity: "FAIL",
      passed:
        (summary.ingestionSummary?.failedFileCount ?? 0) === 0 &&
        summary.failedStep !== "ingest",
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
  return checks;
}

function deriveOverallStatus(checks: DailyHealthCheckResult[], recommendation: DailyRunSummary["researchRecommendation"], gatePass: boolean | null): DailyHealthStatus {
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
    healthChecks
  };
}

export function buildDailyRunArtifact(
  summary: DailyRunSummary,
  artifacts: LatestDailyArtifacts
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
    researchGeneratedAtUtc: artifacts.researchArtifact?.generatedAtUtc ?? null
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
    `Daily artifact Markdown: ${summary.artifactPaths.dailyMarkdownPath ?? "n/a"}`
  ];
}
