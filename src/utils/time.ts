import type { SessionLabel } from "../types.js";

const CHICAGO_TZ = "America/Chicago";
const KST_TZ = "Asia/Seoul";

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function buildFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = buildFormatter(timeZone);
  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function asDate(input: Date | string): Date {
  return input instanceof Date ? input : new Date(input);
}

export function getZonedParts(input: Date | string, timeZone: string): ZonedParts {
  const date = asDate(input);
  const parts = getFormatter(timeZone).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second)
  };
}

export function formatDateKey(parts: Pick<ZonedParts, "year" | "month" | "day">): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day
    .toString()
    .padStart(2, "0")}`;
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export function getSessionLabelChicago(input: Date | string): SessionLabel {
  const { hour } = getZonedParts(input, CHICAGO_TZ);
  if (hour >= 17 || hour <= 1) {
    return "ASIA";
  }
  if (hour >= 2 && hour <= 7) {
    return "EUROPE";
  }
  if (hour >= 8 && hour <= 15) {
    return "US";
  }
  return "CLOSED";
}

export function getTradingDateChicago(input: Date | string): string {
  const parts = getZonedParts(input, CHICAGO_TZ);
  const base = formatDateKey(parts);
  return parts.hour >= 17 ? shiftDateKey(base, 1) : base;
}

export function buildSessionKey(input: Date | string): string {
  return `${getTradingDateChicago(input)}_${getSessionLabelChicago(input)}`;
}

export function minutesSinceSessionStart(input: Date | string): number | null {
  const parts = getZonedParts(input, CHICAGO_TZ);
  const session = getSessionLabelChicago(input);
  if (session === "CLOSED") {
    return null;
  }
  const minutes = parts.hour * 60 + parts.minute;
  if (session === "ASIA") {
    if (parts.hour >= 17) {
      return minutes - 17 * 60;
    }
    return (24 * 60 + minutes) - 17 * 60;
  }
  if (session === "EUROPE") {
    return minutes - 2 * 60;
  }
  return minutes - 8 * 60;
}

export function getChicagoTimestampLabel(input: Date | string): string {
  const parts = getZonedParts(input, CHICAGO_TZ);
  return `${formatDateKey(parts)} ${parts.hour.toString().padStart(2, "0")}:${parts.minute
    .toString()
    .padStart(2, "0")}:${parts.second.toString().padStart(2, "0")}`;
}

export function getKstTimestampLabel(input: Date | string): string {
  const parts = getZonedParts(input, KST_TZ);
  return `${formatDateKey(parts)} ${parts.hour.toString().padStart(2, "0")}:${parts.minute
    .toString()
    .padStart(2, "0")}:${parts.second.toString().padStart(2, "0")}`;
}

export function addMinutesUtc(input: Date | string, minutes: number): string {
  const date = asDate(input);
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export function sessionBoundaryAfter(input: Date | string): string {
  const session = getSessionLabelChicago(input);
  if (session === "CLOSED") {
    return asDate(input).toISOString();
  }

  let candidate = asDate(input);
  for (let step = 0; step < 12 * 60; step += 1) {
    candidate = new Date(candidate.getTime() + 60_000);
    if (getSessionLabelChicago(candidate) !== session) {
      return candidate.toISOString();
    }
  }

  throw new Error(`Unable to find session boundary after ${asDate(input).toISOString()}`);
}

export function diffMinutesUtc(start: Date | string, end: Date | string): number {
  return Math.round((asDate(end).getTime() - asDate(start).getTime()) / 60_000);
}

export function sameUtcDay(left: Date | string, right: Date | string): boolean {
  return asDate(left).toISOString().slice(0, 10) === asDate(right).toISOString().slice(0, 10);
}
