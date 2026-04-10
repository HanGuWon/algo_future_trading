import type { Bar, ContractWindow } from "../types.js";

const MONTH_CODES = ["H", "M", "U", "Z"] as const;
const MONTH_VALUES = [3, 6, 9, 12] as const;

function thirdFridayUtc(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1, 21, 0, 0));
  const firstDay = first.getUTCDay();
  const offset = (5 - firstDay + 7) % 7;
  const firstFriday = 1 + offset;
  const thirdFriday = firstFriday + 14;
  return new Date(Date.UTC(year, month - 1, thirdFriday, 21, 0, 0));
}

function businessDaysBefore(date: Date, count: number): Date {
  const current = new Date(date);
  let remaining = count;
  while (remaining > 0) {
    current.setUTCDate(current.getUTCDate() - 1);
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return current;
}

function quarterCode(month: number): string {
  const index = MONTH_VALUES.indexOf(month as (typeof MONTH_VALUES)[number]);
  if (index === -1) {
    throw new Error(`Unsupported MNQ quarter month: ${month}`);
  }
  return MONTH_CODES[index];
}

export function buildMnqContractWindows(startYear: number, endYear: number): ContractWindow[] {
  const windows: ContractWindow[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (const month of MONTH_VALUES) {
      const expiry = thirdFridayUtc(year, month);
      const rollStart = businessDaysBefore(expiry, 4);
      const contract = `${quarterCode(month)}${String(year).slice(-2)}`;
      windows.push({
        symbol: "MNQ",
        contract,
        expiryUtc: expiry.toISOString(),
        rollStartUtc: rollStart.toISOString()
      });
    }
  }
  return windows.sort((left, right) => left.expiryUtc.localeCompare(right.expiryUtc));
}

export function resolveActiveMnqContract(tsUtc: string, windows: ContractWindow[]): ContractWindow {
  const target = new Date(tsUtc).getTime();
  for (let index = 0; index < windows.length; index += 1) {
    const current = windows[index];
    const next = windows[index + 1];
    const rollStart = new Date(current.rollStartUtc).getTime();
    const nextRollStart = next ? new Date(next.rollStartUtc).getTime() : Number.POSITIVE_INFINITY;
    if (target >= rollStart && target < nextRollStart) {
      return next ?? current;
    }
    if (target < rollStart) {
      return current;
    }
  }
  return windows[windows.length - 1];
}

export function buildResearchSeries(executionBars: Bar[]): Bar[] {
  if (executionBars.length === 0) {
    return [];
  }
  const sorted = [...executionBars].sort((left, right) => left.tsUtc.localeCompare(right.tsUtc));
  const adjusted: Bar[] = [];
  let offset = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = sorted[index - 1];
    if (previous && previous.contract !== current.contract) {
      offset += current.open - previous.close;
    }
    adjusted.push({
      ...current,
      open: current.open - offset,
      high: current.high - offset,
      low: current.low - offset,
      close: current.close - offset
    });
  }

  return adjusted;
}
