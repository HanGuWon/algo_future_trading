import { writeFile, readFile } from "node:fs/promises";
import type { DateRange, EventWindow, EventType, StrategyConfig } from "../types.js";
import { expandEventWindow, StaticCalendarProvider } from "./eventWindows.js";

interface OfficialSource {
  eventType: EventType;
  url: string;
}

const OFFICIAL_SOURCES: OfficialSource[] = [
  {
    eventType: "FOMC",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
  },
  {
    eventType: "CPI",
    url: "https://www.bls.gov/schedule/news_release/cpi.htm"
  },
  {
    eventType: "EMPLOYMENT",
    url: "https://www.bls.gov/schedule/news_release/empsit.htm"
  }
];

export class OfficialCalendarProvider {
  constructor(
    private readonly config: StrategyConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async syncToFile(outputPath: string): Promise<EventWindow[]> {
    const windows = await this.fetchCurrentWindows();
    await writeFile(outputPath, JSON.stringify(windows, null, 2), "utf8");
    return windows;
  }

  async getWindows(range: DateRange, seedFilePath?: string): Promise<EventWindow[]> {
    const seeded = seedFilePath ? await this.loadSeed(seedFilePath) : [];
    const provider = new StaticCalendarProvider(seeded);
    const covered = provider.getWindows(range);
    if (covered.length > 0) {
      return covered;
    }
    const fetched = await this.fetchCurrentWindows();
    return fetched.filter((window) => window.endUtc >= range.startUtc && window.startUtc <= range.endUtc);
  }

  private async loadSeed(seedFilePath: string): Promise<EventWindow[]> {
    try {
      const raw = await readFile(seedFilePath, "utf8");
      return JSON.parse(raw) as EventWindow[];
    } catch {
      return [];
    }
  }

  private async fetchCurrentWindows(): Promise<EventWindow[]> {
    const windows = await Promise.all(
      OFFICIAL_SOURCES.map(async (source) => {
        const response = await this.fetchImpl(source.url, { headers: { "user-agent": "mnq-research-bot/0.1" } });
        const html = await response.text();
        return this.parseOfficialSchedule(source.eventType, source.url, html);
      })
    );
    return windows.flat().sort((left, right) => left.startUtc.localeCompare(right.startUtc));
  }

  private parseOfficialSchedule(eventType: EventType, sourceUrl: string, html: string): EventWindow[] {
    if (eventType === "FOMC") {
      return this.parseFomcMeetings(html, sourceUrl);
    }

    return this.parseBlsReleaseSchedule(eventType, html, sourceUrl);
  }

  private parseFomcMeetings(html: string, sourceUrl: string): EventWindow[] {
    const windows: EventWindow[] = [];
    const pattern =
      /([A-Z][a-z]+)\s+(\d{1,2})-(\d{1,2}),\s+(\d{4})|([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/g;
    for (const match of html.matchAll(pattern)) {
      const monthName = match[1] ?? match[5];
      const day = Number(match[2] ?? match[6]);
      const year = Number(match[4] ?? match[7]);
      const month = monthIndex(monthName);
      if (month === null) {
        continue;
      }
      const scheduledUtc = new Date(Date.UTC(year, month, day, 18, 0, 0)).toISOString();
      windows.push(
        expandEventWindow(
          "FOMC",
          scheduledUtc,
          this.config.eventBlackoutMinutesBefore,
          this.config.eventBlackoutMinutesAfter,
          sourceUrl,
          "Assumes 2:00 p.m. ET statement release"
        )
      );
    }
    return dedupeWindows(windows);
  }

  private parseBlsReleaseSchedule(eventType: EventType, html: string, sourceUrl: string): EventWindow[] {
    const windows: EventWindow[] = [];
    const pattern = /([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/g;
    for (const match of html.matchAll(pattern)) {
      const month = monthIndex(match[1]);
      const day = Number(match[2]);
      const year = Number(match[3]);
      if (month === null) {
        continue;
      }
      const scheduledUtc = new Date(Date.UTC(year, month, day, 13, 30, 0)).toISOString();
      windows.push(
        expandEventWindow(
          eventType,
          scheduledUtc,
          this.config.eventBlackoutMinutesBefore,
          this.config.eventBlackoutMinutesAfter,
          sourceUrl,
          "Assumes 8:30 a.m. ET release"
        )
      );
    }
    return dedupeWindows(windows);
  }
}

function monthIndex(monthName: string): number | null {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const index = months.indexOf(monthName);
  return index >= 0 ? index : null;
}

function dedupeWindows(windows: EventWindow[]): EventWindow[] {
  const seen = new Set<string>();
  return windows.filter((window) => {
    const key = `${window.eventType}_${window.startUtc}_${window.endUtc}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
