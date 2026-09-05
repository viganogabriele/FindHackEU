"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useTranslation } from "@/contexts/translation-context";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { HackathonCard } from "@/components/hackathon-card";
import { cn } from "@/lib/utils";
import {
  bucketHackathonsByDay,
  buildMonthGrid,
  toDayKey,
} from "@/lib/calendar-hackathons";
import type { Hackathon } from "@/types/hackathon";

/** Number of event indicators shown directly inside a day cell before the
 * rest collapse into a "+N" overflow chip, on the desktop grid layout. */
const MAX_VISIBLE_PER_CELL = 3;

export default function HackathonCalendar({
  hackathons,
}: {
  hackathons: Hackathon[];
}) {
  const { t, locale } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  // The day currently expanded for detail. Kept as two separate pieces of
  // state - one per layout - rather than a single shared key: the desktop
  // grid's Popover is only visually hidden on mobile (`hidden sm:block`),
  // not unmounted, so a shared key meant tapping a day in the mobile
  // agenda also flipped `open` to true on the corresponding (still
  // mounted, just display:none) desktop day cell's Popover. Radix portals
  // PopoverContent to document.body regardless of the trigger's own
  // visibility, and floating-ui falls back to anchoring at (0,0) when the
  // trigger has a zero-size rect (as a display:none element does) - so
  // that hidden Popover rendered as a fixed, top-left-pinned card over the
  // whole page. Found live, 2026-09-05: tapping a mobile agenda day showed
  // a duplicate, floating copy of that day's event list.
  const [selectedDesktopKey, setSelectedDesktopKey] = useState<string | null>(
    null,
  );
  const [selectedMobileKey, setSelectedMobileKey] = useState<string | null>(
    null,
  );

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const days = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const byDay = useMemo(() => bucketHackathonsByDay(hackathons), [hackathons]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
        month: "long",
        year: "numeric",
      }).format(cursor),
    [cursor, locale],
  );

  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(
      locale === "en" ? "en-GB" : locale,
      { weekday: "short" },
    );
    // 2026-01-05 is a Monday - an arbitrary fixed Monday anchor to read
    // localized weekday names off of, independent of the current month.
    return Array.from({ length: 7 }, (_, i) =>
      formatter.format(new Date(2026, 0, 5 + i)),
    );
  }, [locale]);

  const monthHasEvents = useMemo(
    () => days.some((day) => day.inCurrentMonth && byDay.has(day.key)),
    [days, byDay],
  );

  const goToPreviousMonth = () =>
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goToNextMonth = () =>
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const goToToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    const todayKey = toDayKey(today);
    setSelectedDesktopKey(todayKey);
    setSelectedMobileKey(todayKey);
  };

  return (
    <div className="w-full">
      {/* `flex-wrap`: at 320px the month label plus three controls do not
          fit on one line, and wrapping the controls onto a second row is
          better than letting them overflow. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold" aria-live="polite">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-1">
          {/* Was `hidden sm:inline-flex`. Month navigation is one month per
              tap, so hiding this on mobile left a visitor who had browsed
              ahead with no way back to the current month except tapping the
              arrow repeatedly - the one place the shortcut matters most. */}
          <Button variant="outline" size="sm" onClick={goToToday}>
            {t("calendarView.today")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("calendarView.previousMonth")}
            onClick={goToPreviousMonth}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("calendarView.nextMonth")}
            onClick={goToNextMonth}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Desktop / tablet: full 7-column month grid, real <table> semantics. */}
      <div className="hidden overflow-hidden rounded-lg border sm:block">
        <table className="w-full table-fixed border-collapse" role="grid">
          <caption className="sr-only">
            {t("calendarView.gridCaption", { month: monthLabel })}
          </caption>
          <thead>
            <tr>
              {weekdayLabels.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="border-b bg-muted/40 px-2 py-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chunk(days, 7).map((week, weekIndex) => (
              <tr key={weekIndex}>
                {week.map((day) => {
                  const dayHackathons = byDay.get(day.key) ?? [];
                  const visible = dayHackathons.slice(0, MAX_VISIBLE_PER_CELL);
                  const overflow = dayHackathons.length - visible.length;
                  const isOpen = selectedDesktopKey === day.key;

                  return (
                    <td
                      key={day.key}
                      className="h-28 border-b border-r p-0 align-top last:border-r-0"
                    >
                      <Popover
                        open={isOpen}
                        onOpenChange={(open) =>
                          setSelectedDesktopKey(open ? day.key : null)
                        }
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "flex h-full w-full flex-col items-stretch gap-1 p-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                              !day.inCurrentMonth && "text-muted-foreground/50",
                            )}
                            aria-label={dayAriaLabel(
                              day.date,
                              dayHackathons.length,
                              t,
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-6 items-center justify-center self-start rounded-full text-xs font-medium",
                                day.isToday &&
                                  "bg-primary text-primary-foreground",
                              )}
                            >
                              {day.date.getDate()}
                            </span>
                            <span className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                              {visible.map((h) => (
                                <span
                                  key={h.id}
                                  className="truncate rounded-sm bg-muted px-1 py-0.5 text-[0.6875rem] leading-tight text-muted-foreground"
                                >
                                  {h.name}
                                </span>
                              ))}
                              {overflow > 0 && (
                                <span className="text-[0.6875rem] font-medium text-muted-foreground">
                                  {t("calendarView.moreEvents", {
                                    count: overflow,
                                  })}
                                </span>
                              )}
                            </span>
                          </button>
                        </PopoverTrigger>
                        {dayHackathons.length > 0 && (
                          <PopoverContent
                            align="start"
                            className="max-h-[70vh] w-[min(24rem,90vw)] overflow-y-auto p-2"
                          >
                            <DayDetail
                              date={day.date}
                              hackathons={dayHackathons}
                            />
                          </PopoverContent>
                        )}
                      </Popover>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: an agenda-style list of in-month days that actually have
          events, rather than squeezing a 7-column grid into ~50px cells. */}
      <div className="space-y-2 sm:hidden">
        {days
          .filter((day) => day.inCurrentMonth)
          .map((day) => {
            const dayHackathons = byDay.get(day.key) ?? [];
            if (dayHackathons.length === 0) return null;
            const isOpen = selectedMobileKey === day.key;
            return (
              <div key={day.key} className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => setSelectedMobileKey(isOpen ? null : day.key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                        day.isToday
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {day.date.getDate()}
                    </span>
                    <span className="text-sm font-medium">
                      {new Intl.DateTimeFormat(
                        locale === "en" ? "en-GB" : locale,
                        { weekday: "short", day: "numeric", month: "short" },
                      ).format(day.date)}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("calendarView.eventCount", {
                      count: dayHackathons.length,
                    })}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t px-3 py-3">
                    {dayHackathons.map((h) => (
                      <HackathonCard
                        key={h.id}
                        hackathon={h}
                        compact
                        titleLink
                        className="border-0 shadow-none"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        {!monthHasEvents && <EmptyMonth />}
      </div>

      {/* Desktop empty state, mirrored below the grid rather than replacing
          it, so month navigation stays available even for a quiet month. */}
      {!monthHasEvents && (
        <div className="hidden sm:block">
          <EmptyMonth />
        </div>
      )}
    </div>
  );
}

function DayDetail({
  date,
  hackathons,
}: {
  date: Date;
  hackathons: Hackathon[];
}) {
  const { locale } = useTranslation();
  const label = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{label}</p>
      <div className="space-y-3">
        {hackathons.map((h) => (
          <HackathonCard
            key={h.id}
            hackathon={h}
            compact
            titleLink
            className="border-0 shadow-none"
          />
        ))}
      </div>
    </div>
  );
}

function EmptyMonth() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center text-muted-foreground"
    >
      <CalendarDays className="size-8" aria-hidden="true" />
      <p className="text-sm">{t("calendarView.empty")}</p>
    </div>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function dayAriaLabel(
  date: Date,
  count: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return count > 0
    ? `${dateLabel}, ${t("calendarView.eventCount", { count })}`
    : dateLabel;
}
