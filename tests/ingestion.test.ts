import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvBarsDetailed } from "../src/data/barAggregation.js";
import { SqliteStore } from "../src/storage/sqliteStore.js";
import { runCli } from "../src/cli/index.js";

function buildCsv(lines: string[]): string {
  return ["tsUtc,contract,open,high,low,close,volume", ...lines].join("\n");
}

describe("CSV ingestion validation", () => {
  it("parses valid MNQ bars and normalizes contract codes", () => {
    const csv = buildCsv([
      "2026-01-02T14:30:00.000Z,MNQH2026,100,101,99,100.5,10",
      "2026-01-02T14:31:00.000Z,H26,100.5,102,100,101.5,12"
    ]);
    const parsed = parseCsvBarsDetailed(csv, "MNQ");
    expect(parsed.bars).toHaveLength(2);
    expect(parsed.summary.contracts).toEqual(["H26"]);
    expect(parsed.warnings.some((warning) => warning.includes("Normalized MNQ contract codes"))).toBe(true);
  });

  it("rejects missing required columns", () => {
    const csv = ["timestamp,contract,open,high,low,volume", "2026-01-02T14:30:00.000Z,H26,100,101,99,10"].join("\n");
    expect(() => parseCsvBarsDetailed(csv, "MNQ")).toThrow(/must include timestamp.*close columns/i);
  });

  it("rejects duplicate or non-increasing timestamps", () => {
    const csv = buildCsv([
      "2026-01-02T14:30:00.000Z,H26,100,101,99,100.5,10",
      "2026-01-02T14:30:00.000Z,H26,100.5,102,100,101.5,12"
    ]);
    expect(() => parseCsvBarsDetailed(csv, "MNQ")).toThrow(/strictly increasing/i);
  });

  it("rejects inconsistent OHLC values", () => {
    const csv = buildCsv([
      "2026-01-02T14:30:00.000Z,H26,100,99,98,100.5,10"
    ]);
    expect(() => parseCsvBarsDetailed(csv, "MNQ")).toThrow(/High price is inconsistent/i);
  });

  it("uses the fallback contract when the column is blank and reports it", () => {
    const csv = buildCsv([
      "2026-01-02T14:30:00.000Z,,100,101,99,100.5,10",
      "2026-01-02T14:31:00.000Z,,100.5,102,100,101.5,12"
    ]);
    const parsed = parseCsvBarsDetailed(csv, "MNQ", "H26");
    expect(parsed.summary.usedFallbackContract).toBe(true);
    expect(parsed.summary.contracts).toEqual(["H26"]);
  });
});

describe("CLI ingest command", () => {
  it("prints an ingestion summary and stores derived bars", async () => {
    const root = await mkdtemp(join(tmpdir(), "mnq-ingest-"));
    const csvPath = join(root, "mnq.csv");
    const dbPath = join(root, "mnq.sqlite");
    const csv = buildCsv([
      "2026-01-02T14:30:00.000Z,H26,100,101,99,100.5,10",
      "2026-01-02T14:31:00.000Z,H26,100.5,102,100,101.5,12",
      "2026-01-02T14:32:00.000Z,H26,101.5,103,101,102.5,14",
      "2026-01-02T14:33:00.000Z,H26,102.5,104,102,103.5,16",
      "2026-01-02T14:34:00.000Z,H26,103.5,105,103,104.5,18"
    ]);
    await writeFile(csvPath, csv, "utf8");

    const output: string[] = [];
    await runCli(["ingest", "--file", csvPath, "--db", dbPath], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Ingested 5 raw 1m bars"))).toBe(true);
    expect(output.some((line) => line.includes("Contracts: H26"))).toBe(true);

    const store = new SqliteStore(dbPath);
    try {
      expect(store.getBars("MNQ", "1m")).toHaveLength(5);
      expect(store.getBars("MNQ", "5m")).toHaveLength(1);
      expect(store.getBars("MNQ", "15m")).toHaveLength(1);
      expect(store.getBars("MNQ", "1h")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("scans a directory, ingests only new CSV files, and skips already processed files", async () => {
    const root = await mkdtemp(join(tmpdir(), "mnq-ingest-dir-"));
    const dbPath = join(root, "mnq.sqlite");
    await writeFile(join(root, ".keep"), "", "utf8");
    await writeFile(join(root, "ignore.txt"), "ignored", "utf8");
    await writeFile(
      join(root, "a.csv"),
      buildCsv([
        "2026-01-02T14:30:00.000Z,H26,100,101,99,100.5,10",
        "2026-01-02T14:31:00.000Z,H26,100.5,102,100,101.5,12"
      ]),
      "utf8"
    );
    await writeFile(
      join(root, "b.csv"),
      buildCsv([
        "2026-01-02T14:32:00.000Z,H26,101.5,103,101,102.5,14",
        "2026-01-02T14:33:00.000Z,H26,102.5,104,102,103.5,16"
      ]),
      "utf8"
    );

    const firstOutput: string[] = [];
    await runCli(["ingest", "--dir", root, "--db", dbPath], {
      log: (message: string) => {
        firstOutput.push(message);
      }
    });

    expect(firstOutput.some((line) => line.includes("Scanned 2 CSV files"))).toBe(true);
    expect(firstOutput.some((line) => line.includes("New files: 2"))).toBe(true);
    expect(firstOutput.some((line) => line.includes("Skipped files: 0"))).toBe(true);

    const secondOutput: string[] = [];
    await runCli(["ingest", "--dir", root, "--db", dbPath], {
      log: (message: string) => {
        secondOutput.push(message);
      }
    });

    expect(secondOutput.some((line) => line.includes("New files: 0"))).toBe(true);
    expect(secondOutput.some((line) => line.includes("Skipped files: 2"))).toBe(true);

    const store = new SqliteStore(dbPath);
    try {
      expect(store.getBars("MNQ", "1m")).toHaveLength(4);
      expect(store.listIngestionFiles()).toHaveLength(2);
      expect(store.listIngestionFiles().every((record) => record.status === "processed")).toBe(true);
    } finally {
      store.close();
    }
  });

  it("fails when a previously processed file changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "mnq-ingest-update-"));
    const csvPath = join(root, "mnq.csv");
    const dbPath = join(root, "mnq.sqlite");
    await writeFile(
      csvPath,
      buildCsv([
        "2026-01-02T14:30:00.000Z,H26,100,101,99,100.5,10"
      ]),
      "utf8"
    );

    await runCli(["ingest", "--file", csvPath, "--db", dbPath], { log: () => undefined });

    await writeFile(
      csvPath,
      buildCsv([
        "2026-01-02T14:30:00.000Z,H26,100,101,99,100.5,10",
        "2026-01-02T14:31:00.000Z,H26,100.5,102,100,101.5,12"
      ]),
      "utf8"
    );

    await expect(runCli(["ingest", "--file", csvPath, "--db", dbPath], { log: () => undefined })).rejects.toThrow(
      /reprocessing is blocked/i
    );

    const store = new SqliteStore(dbPath);
    try {
      const record = store.getIngestionFile(csvPath);
      expect(record?.status).toBe("failed");
      expect(record?.failureReason).toMatch(/reprocessing is blocked/i);
    } finally {
      store.close();
    }
  });

  it("rejects using --file and --dir together", async () => {
    const root = await mkdtemp(join(tmpdir(), "mnq-ingest-conflict-"));
    const csvPath = join(root, "mnq.csv");
    await writeFile(
      csvPath,
      buildCsv([
        "2026-01-02T14:30:00.000Z,H26,100,101,99,100.5,10"
      ]),
      "utf8"
    );

    await expect(
      runCli(["ingest", "--file", csvPath, "--dir", root], { log: () => undefined })
    ).rejects.toThrow(/either --file or --dir/i);
  });
});
