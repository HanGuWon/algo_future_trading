import { execFileSync } from "node:child_process";
import type { Bar, DateRange, InputMode, RunProvenance } from "../types.js";

interface BuildRunProvenanceOptions {
  dbPath: string | null;
  eventWindowCount: number;
  bars?: Bar[];
  sourceRange?: DateRange | null;
  gitCommitSha?: string | null;
  inputMode?: InputMode;
  inputPath?: string | null;
}

export function resolveGitCommitSha(
  cwd = process.cwd(),
  execImpl: typeof execFileSync = execFileSync
): string | null {
  try {
    const raw = execImpl("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8"
    });
    const commit = String(raw).trim();
    return commit.length > 0 ? commit : null;
  } catch {
    return null;
  }
}

export function deriveSourceRangeFromBars(bars: Bar[]): DateRange | null {
  if (bars.length === 0) {
    return null;
  }
  return {
    startUtc: bars[0]!.tsUtc,
    endUtc: bars[bars.length - 1]!.tsUtc
  };
}

export function buildRunProvenance(options: BuildRunProvenanceOptions): RunProvenance {
  return {
    gitCommitSha: options.gitCommitSha ?? resolveGitCommitSha(),
    nodeVersion: process.version,
    dbPath: options.dbPath,
    eventWindowCount: options.eventWindowCount,
    sourceRange: options.sourceRange ?? deriveSourceRangeFromBars(options.bars ?? []),
    inputMode: options.inputMode ?? "none",
    inputPath: options.inputPath ?? null
  };
}
