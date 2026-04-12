import { describe, expect, it } from "vitest";
import { buildRunProvenance, deriveSourceRangeFromBars, resolveGitCommitSha } from "../src/utils/runProvenance.js";
import type { Bar } from "../src/types.js";

const bars: Bar[] = [
  {
    symbol: "MNQ",
    contract: "H26",
    tsUtc: "2026-04-10T00:00:00.000Z",
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1,
    sessionLabel: "CLOSED"
  },
  {
    symbol: "MNQ",
    contract: "H26",
    tsUtc: "2026-04-10T00:01:00.000Z",
    open: 100.5,
    high: 102,
    low: 100,
    close: 101,
    volume: 1,
    sessionLabel: "CLOSED"
  }
];

describe("run provenance", () => {
  it("derives a source range from bars", () => {
    expect(deriveSourceRangeFromBars(bars)).toEqual({
      startUtc: "2026-04-10T00:00:00.000Z",
      endUtc: "2026-04-10T00:01:00.000Z"
    });
  });

  it("returns null when git sha cannot be resolved", () => {
    const sha = resolveGitCommitSha(process.cwd(), (() => {
      throw new Error("no git");
    }) as typeof import("node:child_process").execFileSync);
    expect(sha).toBeNull();
  });

  it("builds provenance from explicit inputs", () => {
    const provenance = buildRunProvenance({
      dbPath: "data/test.sqlite",
      eventWindowCount: 3,
      bars,
      gitCommitSha: "abc123"
    });

    expect(provenance.gitCommitSha).toBe("abc123");
    expect(provenance.dbPath).toBe("data/test.sqlite");
    expect(provenance.eventWindowCount).toBe(3);
    expect(provenance.sourceRange?.startUtc).toBe("2026-04-10T00:00:00.000Z");
    expect(provenance.inputMode).toBe("none");
    expect(provenance.inputPath).toBeNull();
  });

  it("records explicit input context", () => {
    const provenance = buildRunProvenance({
      dbPath: "data/test.sqlite",
      eventWindowCount: 1,
      sourceRange: {
        startUtc: "2026-04-10T00:00:00.000Z",
        endUtc: "2026-04-10T01:00:00.000Z"
      },
      gitCommitSha: "abc123",
      inputMode: "dir",
      inputPath: "C:\\data\\mnq"
    });

    expect(provenance.inputMode).toBe("dir");
    expect(provenance.inputPath).toBe("C:\\data\\mnq");
  });
});
