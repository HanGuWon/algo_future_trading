import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type {
  BatchRunArtifact,
  DailyRunSummary,
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
    researchJsonPath: researchName ? join(researchDir, researchName) : null
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

export function buildDailyRunSummary(artifacts: LatestDailyArtifacts): DailyRunSummary {
  const batchArtifact = artifacts.batchArtifact;
  const paperStepCompleted = batchArtifact?.steps.some((step) => step.step === "paper" && step.status === "completed") ?? false;
  const researchStepCompleted =
    batchArtifact?.steps.some((step) => step.step === "research" && step.status === "completed") ?? false;

  return {
    generatedAtUtc: new Date().toISOString(),
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
      researchJsonPath: researchStepCompleted ? artifacts.pointers.researchJsonPath : null
    }
  };
}

function sourceRangeLabel(summary: DailyRunSummary): string {
  if (!summary.ingestionSummary?.sourceRange) {
    return "n/a";
  }
  return `${summary.ingestionSummary.sourceRange.startUtc} -> ${summary.ingestionSummary.sourceRange.endUtc}`;
}

export function renderDailyRunSummary(summary: DailyRunSummary): string[] {
  return [
    "Daily run summary",
    `Batch status: ${summary.batchStatus}`,
    `Failed step: ${summary.failedStep ?? "none"}`,
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
    `Research artifact JSON: ${summary.artifactPaths.researchJsonPath ?? "n/a"}`
  ];
}
