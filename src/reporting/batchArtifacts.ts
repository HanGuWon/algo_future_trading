import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type { BatchRunArtifact } from "../types.js";

export async function writeBatchArtifact(
  artifact: BatchRunArtifact,
  artifactsDir = DEFAULT_ARTIFACTS_DIR
): Promise<{ jsonPath: string }> {
  const targetDir = join(artifactsDir, "batch");
  await mkdir(targetDir, { recursive: true });
  const timestamp = artifact.generatedAtUtc.replace(/[:.]/g, "-");
  const jsonPath = join(targetDir, `batch-run-${timestamp}.json`);
  await writeFile(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
  return { jsonPath };
}
