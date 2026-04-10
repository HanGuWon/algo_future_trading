import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type { ResearchReportArtifact } from "../types.js";

export async function writeResearchArtifact(
  artifact: ResearchReportArtifact,
  artifactsDir = DEFAULT_ARTIFACTS_DIR
): Promise<string> {
  const targetDir = join(artifactsDir, "research");
  await mkdir(targetDir, { recursive: true });
  const timestamp = artifact.generatedAtUtc.replace(/[:.]/g, "-");
  const path = join(targetDir, `research-report-${timestamp}.json`);
  await writeFile(path, JSON.stringify(artifact, null, 2), "utf8");
  return path;
}
