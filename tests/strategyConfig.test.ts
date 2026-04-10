import { rmSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_STRATEGY_CONFIG_PATH } from "../src/config/defaults.js";
import { loadStrategyConfig, resolveStrategyConfigPath } from "../src/config/strategyLoader.js";

describe("strategy config loader", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("loads the repository default strategy profile", async () => {
    const { config, resolvedPath } = await loadStrategyConfig();

    expect(resolvedPath).toBe(resolveStrategyConfigPath(DEFAULT_STRATEGY_CONFIG_PATH));
    expect(config.maFast).toBe(20);
    expect(config.maSlow).toBe(120);
    expect(config.confluenceThreshold).toBe(3);
    expect(config.eventBlackoutMinutesAfter).toBe(60);
  });

  it("merges a partial override profile onto the default config", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "strategy-config-"));
    tempDirs.push(tempDir);
    const configPath = join(tempDir, "override.json");

    await writeFile(
      configPath,
      JSON.stringify({
        maFast: 30,
        confluenceThreshold: 4,
        eventBlackoutMinutesAfter: 120
      }),
      "utf8"
    );

    const { config } = await loadStrategyConfig(configPath);
    expect(config.maFast).toBe(30);
    expect(config.maSlow).toBe(120);
    expect(config.confluenceThreshold).toBe(4);
    expect(config.eventBlackoutMinutesAfter).toBe(120);
    expect(config.riskPctPerTrade).toBe(0.0025);
  });

  it("rejects invalid profiles", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "strategy-config-invalid-"));
    tempDirs.push(tempDir);
    const configPath = join(tempDir, "invalid.json");

    await writeFile(
      configPath,
      JSON.stringify({
        maFast: 160,
        maSlow: 120
      }),
      "utf8"
    );

    await expect(loadStrategyConfig(configPath)).rejects.toThrow("maFast must be < maSlow");
  });
});
