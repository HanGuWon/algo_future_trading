import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type { PaperReportArtifact } from "../types.js";

export async function writePaperArtifact(artifact: PaperReportArtifact, artifactsDir = DEFAULT_ARTIFACTS_DIR): Promise<string> {
  const targetDir = join(artifactsDir, "paper");
  await mkdir(targetDir, { recursive: true });
  const timestamp = artifact.generatedAtUtc.replace(/[:.]/g, "-");
  const path = join(targetDir, `paper-report-${timestamp}.json`);
  await writeFile(path, JSON.stringify(artifact, null, 2), "utf8");
  return path;
}
