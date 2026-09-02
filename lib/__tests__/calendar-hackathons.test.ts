import { describe, expect, it } from "vitest";
import type { Hackathon } from "@/types/hackathon";
import {
  bucketHackathonsByDay,
  buildMonthGrid,
  hackathonDayKeys,
  toDayKey,
} from "@/lib/calendar-hackathons";

const baseHackathon = {
  id: "1",
  name: "Berlin AI Hackathon",
  city: "Berlin",
  country_code: "DE",
  date_start: "2026-10-10T09:00:00Z",
  date_end: "2026-10-12T17:00:00Z",
  topics: ["AI"],
} as Hackathon;

describe("toDayKey", () => {
  it("formats using the local calendar day, not UTC", () => {
    expect(toDayKey(new Date(2026, 9, 10))).toBe("2026-10-10");
  });

  it("zero-pads single-digit months and days", () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("hackathonDayKeys", () => {
  it("returns every day in a multi-day date_start..date_end range, inclusive", () => {
    const hackathon = {
      ...baseHackathon,
      date_start: "2026-10-10T09:00:00",
      date_end: "2026-10-12T17:00:00",
    } as Hackathon;

    expect(hackathonDayKeys(hackathon)).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);
  });

  it("returns a single day when date_end is null", () => {
    const hackathon = {
      ...baseHackathon,
      date_start: "2026-10-10T09:00:00",
      date_end: null,
    } as Hackathon;

    expect(hackathonDayKeys(hackathon)).toEqual(["2026-10-10"]);
  });

  it("returns no days for a null date_start (estimated hackathon)", () => {
    const hackathon = {
      ...baseHackathon,
      date_start: null,
    } as unknown as Hackathon;

    expect(hackathonDayKeys(hackathon)).toEqual([]);
  });

  it("returns no days for an unparseable date_start", () => {
    const hackathon = {
      ...baseHackathon,
      date_start: "not-a-date",
    } as Hackathon;

    expect(hackathonDayKeys(hackathon)).toEqual([]);
  });

  it("falls back to a single day when date_end is before date_start", () => {
    const hackathon = {
      ...baseHackathon,
      date_start: "2026-10-10T09:00:00",
      date_end: "2026-10-05T09:00:00",
    } as Hackathon;

    expect(hackathonDayKeys(hackathon)).toEqual(["2026-10-10"]);
  });
});

describe("bucketHackathonsByDay", () => {
  it("places a hackathon under every day it spans", () => {
    const hackathon = {
      ...baseHackathon,
      date_start: "2026-10-10T09:00:00",
      date_end: "2026-10-11T17:00:00",
    } as Hackathon;

    const map = bucketHackathonsByDay([hackathon]);
    expect(map.get("2026-10-10")).toEqual([hackathon]);
    expect(map.get("2026-10-11")).toEqual([hackathon]);
    expect(map.has("2026-10-12")).toBe(false);
  });

  it("groups multiple hackathons sharing the same day", () => {
    const a = { ...baseHackathon, id: "1", date_end: null } as Hackathon;
    const b = { ...baseHackathon, id: "2", date_end: null } as Hackathon;

    const map = bucketHackathonsByDay([a, b]);
    expect(map.get("2026-10-10")).toEqual([a, b]);
  });
});

describe("buildMonthGrid", () => {
  it("always returns a whole number of 7-day weeks", () => {
    // October 2026 (0-indexed month 9)
    const days = buildMonthGrid(2026, 9);
    expect(days.length % 7).toBe(0);
  });

  it("starts the grid on a Monday", () => {
    const days = buildMonthGrid(2026, 9);
    expect(days[0].date.getDay()).toBe(1); // Monday
  });

  it("flags every day belonging to the requested month as inCurrentMonth", () => {
    const days = buildMonthGrid(2026, 9);
    const inMonth = days.filter((d) => d.inCurrentMonth);
    expect(inMonth).toHaveLength(31);
    expect(inMonth[0].date.getDate()).toBe(1);
    expect(inMonth[inMonth.length - 1].date.getDate()).toBe(31);
  });

  it("flags leading/trailing filler days from adjacent months as not inCurrentMonth", () => {
    const days = buildMonthGrid(2026, 9);
    const filler = days.filter((d) => !d.inCurrentMonth);
    // October 1, 2026 is a Thursday, so 3 leading filler days from September.
    expect(filler.length).toBeGreaterThan(0);
    for (const day of filler) {
      expect(day.date.getMonth()).not.toBe(9);
    }
  });

  it("produces contiguous, ascending day keys with no gaps or duplicates", () => {
    const days = buildMonthGrid(2026, 9);
    const keys = days.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (let i = 1; i < days.length; i++) {
      const prev = days[i - 1].date;
      const cur = days[i].date;
      const diffDays = Math.round(
        (cur.getTime() - prev.getTime()) / 86_400_000,
      );
      expect(diffDays).toBe(1);
    }
  });
});
