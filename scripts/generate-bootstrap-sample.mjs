import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve(process.argv[2] ?? "data/mnq_drop/bootstrap-synthetic-mnq.csv");
const chunkHours = 24 * 7;
const signalOffsets = [125, 126, 127, 128];
const anchors = [
  "2018-01-01T00:00:00.000Z",
  "2020-01-01T00:00:00.000Z",
  "2022-01-01T00:00:00.000Z",
  "2024-01-01T00:00:00.000Z",
  "2026-04-10T00:00:00.000Z"
];

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function interpolateMinutePrice(shape, minute) {
  if (minute <= 10) {
    return lerp(shape.open, shape.low, minute / 10);
  }
  if (minute <= 45) {
    return lerp(shape.low, shape.high, (minute - 10) / 35);
  }
  return lerp(shape.high, shape.close, (minute - 45) / 14);
}

function buildTrendingHourShapes(startUtc, hours, chunkIndex) {
  const shapes = [];
  let price = 10_000 + chunkIndex * 250;
  const startMs = new Date(startUtc).getTime();
  for (let index = 0; index < hours; index += 1) {
    const tsUtc = new Date(startMs + index * 60 * 60_000).toISOString();
    const open = price;
    const close = price + 3 + (index % 3) * 0.5;
    const high = close + 1.25;
    const low = open - 1;
    shapes.push({ tsUtc, open, high, low, close, contract: "H26" });
    price = close;
  }

  for (const offset of signalOffsets) {
    const signal = shapes[offset];
    const prior = shapes[offset - 1];
    const next = shapes[offset + 1];
    if (!signal || !prior || !next) {
      continue;
    }
    signal.open = prior.close + 2;
    signal.low = prior.low - 12;
    signal.high = prior.close + 12;
    signal.close = signal.high - 0.75;

    next.open = signal.close;
    next.low = signal.close - 0.5;
    next.high = signal.high + 28;
    next.close = next.high - 1;
  }

  return shapes;
}

function expandHourlyShapesToCsvRows(shapes) {
  const rows = [];
  for (const shape of shapes) {
    const baseTs = new Date(shape.tsUtc).getTime();
    for (let minute = 0; minute < 60; minute += 1) {
      const tsUtc = new Date(baseTs + minute * 60_000).toISOString();
      const open = interpolateMinutePrice(shape, minute);
      const close = interpolateMinutePrice(shape, Math.min(minute + 1, 59));
      const high = Math.max(open, close, minute === 45 ? shape.high : Number.NEGATIVE_INFINITY);
      const low = Math.min(open, close, minute === 10 ? shape.low : Number.POSITIVE_INFINITY);
      rows.push(
        [
          tsUtc,
          shape.contract,
          open.toFixed(2),
          high.toFixed(2),
          low.toFixed(2),
          close.toFixed(2),
          "1"
        ].join(",")
      );
    }
  }
  return rows;
}

async function main() {
  const allRows = ["tsUtc,contract,open,high,low,close,volume"];
  anchors.forEach((anchor, chunkIndex) => {
    const shapes = buildTrendingHourShapes(anchor, chunkHours, chunkIndex);
    allRows.push(...expandHourlyShapesToCsvRows(shapes));
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${allRows.join("\n")}\n`, "utf8");
  console.log(`Wrote bootstrap synthetic MNQ CSV to ${outputPath}`);
  console.log(`Rows: ${allRows.length - 1}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
