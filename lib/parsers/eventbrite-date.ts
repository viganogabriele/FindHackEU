interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

interface LocalDateTime extends CalendarDate {
  hours: number;
  minutes: number;
  seconds: number;
}

export interface EventbriteStructuredDate {
  start_date?: string;
  start_time?: string;
  timezone?: string;
  end_date?: string;
  end_time?: string;
}

export interface EventbriteDateInput {
  dateText: string;
  structured?: EventbriteStructuredDate;
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Converts Eventbrite's structured local date/time fields to UTC. The
 * timezone map is supplied by the owning parser because it is also the
 * parser's source-country policy for yearless card dates.
 */
export function parseEventbriteDates(
  event: EventbriteDateInput,
  countryCode: string | undefined,
  now: Date,
  countryTimezones: Record<string, string>,
): { start: Date; end?: Date } | null {
  const structured = event.structured;
  const timezone = structured?.timezone || countryTimezones[countryCode ?? ""];

  if (structured?.start_date && structured.start_time && timezone) {
    const start = parseLocalDateTime(
      structured.start_date,
      structured.start_time,
      timezone,
    );

    if (start) {
      let end: Date | undefined;

      if (structured.end_date) {
        const parsedEnd = parseLocalDateTime(
          structured.end_date,
          structured.end_time || "23:59",
          timezone,
        );

        // Do not silently manufacture a wrong end date when Eventbrite
        // provides an invalid structured value.
        if (!parsedEnd) {
          return null;
        }

        end = parsedEnd;
      }

      return { start, end };
    }
  }

  if (!event.dateText || !timezone) {
    return null;
  }

  const start = parseEventbriteDate(event.dateText, now, timezone);
  return start ? { start } : null;
}

/**
 * Parses Eventbrite's yearless rendered-card date text. The result is a UTC
 * instant, but every local wall-clock value is interpreted in the supplied
 * IANA timezone first.
 */
function parseEventbriteDate(
  rawText: string,
  now: Date,
  timezone: string,
): Date | null {
  const cleaned = rawText.replace(/\s*\+\s*\d+\s*more\s*$/i, "").trim();
  const localNow = getTimeZoneParts(now, timezone);

  if (!localNow) {
    return null;
  }

  const todayMatch = cleaned.match(/^today\s+at\s+(.+)$/i);
  if (todayMatch) {
    const time = parseTimeOfDay(todayMatch[1]);
    if (!time) return null;

    return parseLocalDateTime(
      formatCalendarDate(localNow),
      formatClockTime(time.hours, time.minutes),
      timezone,
    );
  }

  const weekdayMatch = cleaned.match(
    /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+at\s+(.+)$/i,
  );
  if (weekdayMatch) {
    const time = parseTimeOfDay(weekdayMatch[2]);
    if (!time) return null;

    const targetWeekday = WEEKDAYS.indexOf(weekdayMatch[1].toLowerCase());
    const calendarDate = resolveNextWeekday(now, targetWeekday, timezone);

    if (!calendarDate) return null;

    return parseLocalDateTime(
      formatCalendarDate(calendarDate),
      formatClockTime(time.hours, time.minutes),
      timezone,
    );
  }

  // Normal shape: "Thu, Nov 12, 5:00 PM" - weekday name is not needed for
  // parsing, only month/day/time.
  const normalMatch = cleaned.match(
    /^\w{3,},\s*([a-z]{3})[a-z]*\s+(\d{1,2}),\s*(.+)$/i,
  );
  if (!normalMatch) {
    return null;
  }

  const monthIndex = MONTHS.indexOf(normalMatch[1].toLowerCase());
  if (monthIndex === -1) return null;

  const day = Number.parseInt(normalMatch[2], 10);
  const time = parseTimeOfDay(normalMatch[3]);
  if (!time) return null;

  const currentYear = localNow.year;
  let candidate = parseLocalDateTime(
    formatCalendarDate({
      year: currentYear,
      month: monthIndex + 1,
      day,
    }),
    formatClockTime(time.hours, time.minutes),
    timezone,
  );

  if (!candidate) {
    return null;
  }

  // Yearless date already elapsed this year -> assume it refers to next
  // year instead of silently treating it as a past event.
  if (candidate < now) {
    candidate = parseLocalDateTime(
      formatCalendarDate({
        year: currentYear + 1,
        month: monthIndex + 1,
        day,
      }),
      formatClockTime(time.hours, time.minutes),
      timezone,
    );
  }

  return candidate;
}

function parseTimeOfDay(
  text: string,
): { hours: number; minutes: number } | null {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();

  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
    return null;
  }

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return { hours, minutes };
}

function resolveNextWeekday(
  now: Date,
  targetWeekday: number,
  timezone: string,
): CalendarDate | null {
  const localNow = getTimeZoneParts(now, timezone);
  if (!localNow) return null;

  const base = new Date(
    Date.UTC(localNow.year, localNow.month - 1, localNow.day),
  );
  const currentWeekday = base.getUTCDay();

  let diff = targetWeekday - currentWeekday;
  if (diff < 0) diff += 7;

  base.setUTCDate(base.getUTCDate() + diff);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

function formatCalendarDate(date: CalendarDate): string {
  return [date.year, date.month, date.day]
    .map((value, index) => value.toString().padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function formatClockTime(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
}

function getTimeZoneFormatter(timezone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timezone);
  if (cached) {
    return cached;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timezone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

/** Reads a real instant as calendar fields in a named IANA timezone. */
function getTimeZoneParts(date: Date, timezone: string): LocalDateTime | null {
  const formatter = getTimeZoneFormatter(timezone);
  if (!formatter) {
    return null;
  }

  const formatted = formatter.formatToParts(date);
  const values: Record<string, number> = {};

  for (const part of formatted) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number.parseInt(part.value, 10);
    }
  }

  if (
    !Number.isInteger(values.year) ||
    !Number.isInteger(values.month) ||
    !Number.isInteger(values.day) ||
    !Number.isInteger(values.hour) ||
    !Number.isInteger(values.minute) ||
    !Number.isInteger(values.second)
  ) {
    return null;
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hours: values.hour,
    minutes: values.minute,
    seconds: values.second,
  };
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number | null {
  const parts = getTimeZoneParts(date, timezone);
  if (!parts) return null;

  const utcEquivalent = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hours,
    parts.minutes,
    parts.seconds,
  );

  return utcEquivalent - date.getTime();
}

/** Converts a local wall-clock value in an IANA timezone to a UTC Date. */
function parseLocalDateTime(
  dateText: string,
  timeText: string,
  timezone: string,
): Date | null {
  const dateMatch = dateText.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeText.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10);
  const day = Number.parseInt(dateMatch[3], 10);
  const hours = Number.parseInt(timeMatch[1], 10);
  const minutes = Number.parseInt(timeMatch[2], 10);
  const seconds = timeMatch[3] ? Number.parseInt(timeMatch[3], 10) : 0;

  if (
    month < 1 ||
    month > 12 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }

  const wallClockUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  const initialOffset = getTimeZoneOffsetMs(new Date(wallClockUtc), timezone);

  if (initialOffset === null) {
    return null;
  }

  let candidate = new Date(wallClockUtc - initialOffset);
  const correctedOffset = getTimeZoneOffsetMs(candidate, timezone);

  if (correctedOffset === null) {
    return null;
  }

  candidate = new Date(wallClockUtc - correctedOffset);
  const actual = getTimeZoneParts(candidate, timezone);

  if (
    !actual ||
    actual.year !== year ||
    actual.month !== month ||
    actual.day !== day ||
    actual.hours !== hours ||
    actual.minutes !== minutes ||
    actual.seconds !== seconds
  ) {
    // This also rejects nonexistent wall-clock values in a DST spring gap
    // instead of returning a silently shifted instant.
    return null;
  }

  return candidate;
}
