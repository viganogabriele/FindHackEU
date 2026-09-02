import type { Hackathon } from "@/types/hackathon";

/**
 * Pure date-bucketing logic for the Calendar view (components/hackathon-calendar.tsx).
 * Kept separate from the component so the "does this hackathon's
 * date_start..date_end range cover this day" and "which days belong on
 * this month's grid" logic can be unit-tested without rendering React.
 */

/** YYYY-MM-DD, using the local calendar day - never UTC, so a day cell's
 * bucket matches what a viewer visually sees in their own calendar. */
export type DayKey = string;

export function toDayKey(date: Date): DayKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Every local calendar day a hackathon's date_start..date_end range
 * touches, inclusive of both ends. A hackathon with no date_start (e.g. an
 * "estimated" row - see promote-candidate.ts) contributes no days rather
 * than being treated as "today", which would be misleading.
 */
export function hackathonDayKeys(hackathon: Hackathon): DayKey[] {
  if (!hackathon.date_start) return [];
  const start = new Date(hackathon.date_start);
  if (Number.isNaN(start.getTime())) return [];

  const endRaw = hackathon.date_end ? new Date(hackathon.date_end) : start;
  const end = Number.isNaN(endRaw.getTime()) ? start : endRaw;

  const from = startOfDay(start);
  const to = startOfDay(end);
  if (to < from) return [toDayKey(from)];

  // Bounded so a corrupt/absurd date range (e.g. a multi-year typo) can
  // never blow up the loop below.
  const MAX_DAYS = 366;
  const keys: DayKey[] = [];
  const cursor = new Date(from);
  let guard = 0;
  while (cursor <= to && guard < MAX_DAYS) {
    keys.push(toDayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return keys;
}

/** Map of day -> hackathons occurring on that day, for a given list. */
export function bucketHackathonsByDay(
  hackathons: Hackathon[],
): Map<DayKey, Hackathon[]> {
  const map = new Map<DayKey, Hackathon[]>();
  for (const hackathon of hackathons) {
    for (const key of hackathonDayKeys(hackathon)) {
      const existing = map.get(key);
      if (existing) {
        existing.push(hackathon);
      } else {
        map.set(key, [hackathon]);
      }
    }
  }
  return map;
}

export interface CalendarDay {
  date: Date;
  key: DayKey;
  /** Whether this day belongs to the displayed month vs. a leading/trailing
   * filler day from the adjacent month, needed to complete the grid's weeks. */
  inCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Builds the full set of day cells for a month grid, always starting on a
 * Monday and always a whole number of 7-day weeks (so the grid never has a
 * ragged last row) - leading/trailing days from the neighboring months are
 * included and flagged via `inCurrentMonth: false` so the caller can style
 * them as filler instead of omitting them.
 */
export function buildMonthGrid(year: number, month: number): CalendarDay[] {
  const firstOfMonth = new Date(year, month, 1);
  // getDay(): 0 = Sunday .. 6 = Saturday. Convert to a Monday-first offset.
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstWeekday);

  const lastOfMonth = new Date(year, month + 1, 0);
  const lastWeekday = (lastOfMonth.getDay() + 6) % 7;
  const trailingDays = 6 - lastWeekday;
  const totalDays =
    firstWeekday + lastOfMonth.getDate() + trailingDays;

  const today = startOfDay(new Date());
  const days: CalendarDay[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    days.push({
      date,
      key: toDayKey(date),
      inCurrentMonth: date.getMonth() === month,
      isToday: date.getTime() === today.getTime(),
    });
  }
  return days;
}
