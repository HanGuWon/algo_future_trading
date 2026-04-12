import { resolve } from "node:path";

interface BuildDailyAutomationSpecOptions {
  dbPath: string;
  configPath: string;
  artifactsDir: string;
  inputDir: string;
  startUtc?: string;
  endUtc?: string;
  cwd?: string;
}

export interface DailyAutomationSpec {
  name: string;
  scheduleLabel: string;
  cwd: string;
  command: string;
}

export function buildDailyAutomationCommand(options: Omit<BuildDailyAutomationSpecOptions, "cwd">): string {
  const parts = [
    "npm run daily --",
    `--db "${options.dbPath}"`,
    `--config "${options.configPath}"`,
    `--artifacts-dir "${options.artifactsDir}"`,
    `--input-dir "${options.inputDir}"`
  ];
  if (options.startUtc) {
    parts.push(`--start "${options.startUtc}"`);
  }
  if (options.endUtc) {
    parts.push(`--end "${options.endUtc}"`);
  }
  return parts.join(" ");
}

export function buildDailyAutomationSpec(options: BuildDailyAutomationSpecOptions): DailyAutomationSpec {
  return {
    name: "MNQ Daily Run",
    scheduleLabel: "Every day at 06:00 Asia/Seoul",
    cwd: resolve(options.cwd ?? process.cwd()),
    command: buildDailyAutomationCommand(options)
  };
}
