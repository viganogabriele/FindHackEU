import {
  BaseParser,
  ParsedHackathon,
  DiscoverResult,
  ParseStatus,
} from "@/lib/parsers/base-parser";
import { europeanCountries } from "@/lib/european-countries";
import {
  MAX_FUTURE_DAYS,
  getMaxFutureCutoff,
} from "@/lib/config/discovery-config";
import { classifyHackathon } from "@/lib/classification/hackathon-classifier";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import type { DroppedCounts } from "@/lib/providers/provider.interface";

/**
 * Per-run counters for this file's reject points, surfaced through the
 * return value (issue #31 style, same pattern as every other parser here).
 * Unlike Devfolio/MLH/ETHGlobal (dedicated hackathon platforms), Eventbrite's
 * "hackathon" directory category is not exclusively hackathons (see class
 * doc comment below) - so, like Luma, this parser has a real classifier
 * stage. `byCountry` is intentionally omitted: the country here comes from
 * which directory page was fetched (a curated, all-European slug list), not
 * from per-event data, so there is no per-event country-drop decision to
 * count.
 */
interface EventbriteDropStats {
  droppedByClassifier: number;
  excludedPastFutureWindow: number;
  droppedByUnparseableDate: number;
}

/** A single raw event card extracted from a directory page's HTML. */
interface EventbriteRawEvent {
  id: string;
  url: string;
  name: string;
  location: string;
  dateText: string;
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

/**
 * Eventbrite's official Search API was shut down in 2020 (already documented
 * in issue #10 as a rejected approach for this project) - this parser does
 * NOT use that API. Instead it scrapes Eventbrite's public **directory**
 * pages (e.g. `https://www.eventbrite.com/d/germany/hackathon/`), a
 * distinct, still-live surface verified live on 2026-09-01:
 *
 * - NOT blocked by `robots.txt` for this path pattern - that file disallows
 *   `/directory/`, several query-param patterns, and some API/checkout
 *   paths, but not `/d/{country}/{category}/`.
 * - NOT behind Cloudflare or any bot challenge - a plain `fetch`/`curl` with
 *   a browser User-Agent gets a normal 200 with full server-rendered HTML.
 * - Confirmed working for every country slug this parser queries
 *   (`countrySlugs` below), all returning HTTP 200 with real event data
 *   embedded directly in `data-*` attributes on anchor tags.
 *
 * Two real data-quality issues, both handled deliberately rather than
 * ignored:
 *
 * 1. Eventbrite's "hackathon" directory category includes real false
 *    positives - generic recurring AI workshops/webinars ("Build Your First
 *    Successful AI SaaS", "AI Founder | A to Z", "Master AI Entrepreneurship"
 *    were all observed live in the German listing on 2026-09-01), not just
 *    genuine hackathons. Unlike Devfolio/MLH/ETHGlobal (dedicated hackathon
 *    platforms where every listing IS a hackathon), every candidate's `name`
 *    is run through the same shared classifier Luma uses
 *    (`classifyHackathon`) - only "accepted" survives; "borderline" and
 *    "rejected" are both dropped (there is no candidates/review table yet,
 *    same as Luma).
 * 2. Date text has no year and comes in several shapes, all observed live:
 *    - Normal: `"Thu, Nov 12, 5:00 PM"` - weekday, month, day, time. Year is
 *      inferred: try the current year, and if that's already in the past
 *      relative to "now", assume next year instead.
 *    - Recurring/session listings: `"Today at 1:00 PM + 34 more"` or
 *      `"Thursday at 1:00 PM + 34 more"` - a relative single-day reference
 *      (`"Today"` or a bare weekday name) plus a `" + N more"` suffix. The
 *      suffix is stripped; `"Today"` resolves to today's date, and a bare
 *      weekday name resolves to the next occurrence of that weekday from
 *      today (not last week). These recurring-session listings are very
 *      likely to also fail the classifier check anyway (they're generic
 *      workshop series - all four observed live were rejected/borderline),
 *      so no elaborate multi-session handling is attempted here - just
 *      resolve the leading date reasonably and let the classifier be the
 *      real filter. A date that can't be parsed at all is dropped (logged),
 *      not guessed at.
 *
 * Location comes as `data-event-location="City, ST"` (e.g. `"Erlangen, BY"`
 * - city plus a German federal-state abbreviation, not a country - the
 * country is never in this field). Since each directory page is fetched for
 * one specific country slug, the country is known unambiguously from which
 * page was fetched - only `city` (the part before the comma) is extracted;
 * the trailing region/state abbreviation isn't modeled by this project's
 * schema. Some rows have an empty region after the comma (e.g. `"Hamburg, "`,
 * observed live) - handled gracefully by just taking the city part.
 *
 * `location_type` is always `"physical"`: Eventbrite's own event pages
 * nearly always represent physical venues for hackathons, and no clean
 * structured online/hybrid signal was found in the directory page markup
 * (unlike Luma/MLH/ETHGlobal, which all have an explicit field for this).
 */
export class EventbriteParser extends BaseParser {
  readonly name = "eventbrite";
  readonly enabled = true;

  private readonly baseUrl = "https://www.eventbrite.com/d";

  /**
   * Curated set of European directory-page country slugs, verified live
   * (2026-09-01) to return HTTP 200 with real event data for at least:
   * germany, france, italy, spain, netherlands, united-kingdom, poland.
   * The rest are a reasonable starting set of additional European
   * countries Eventbrite is known to operate directory pages for.
   */
  private readonly countrySlugs = [
    "germany",
    "france",
    "italy",
    "spain",
    "netherlands",
    "united-kingdom",
    "poland",
    "belgium",
    "austria",
    "switzerland",
    "sweden",
    "portugal",
    "ireland",
    "denmark",
    "finland",
  ];

  // Small delay between successive country-directory requests, same
  // reasoning as LumaParser's pageDelayMs: this parser fetches 15 pages
  // from the same host in one run - a short, polite gap between requests
  // costs a few seconds of wall-clock time in exchange for being a much
  // better citizen against a host we have no formal API agreement with
  // (unlike Luma's own inter-page delay, robots.txt/live checks earlier
  // today didn't surface any documented per-request rate limit for these
  // directory pages, so this value is a conservative default, not a
  // measured one).
  private readonly countryDelayMs = 500;

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extraction regex validated against a real, freshly fetched directory
   * page (2026-09-01): the relevant anchor is the second of two
   * `data-event-id`-bearing anchors per event card (the first only wraps
   * the thumbnail image) - this one wraps an `<h3>` title and is
   * immediately followed by a `<p>` holding the date text. Each event
   * appears twice on the page (a hidden mobile-card variant duplicates the
   * desktop one), so callers must dedupe by `id`.
   */
  // Numbered groups (1=url, 2=id, 3=location, 4=name, 5=date) and
  // `[\s\S]` instead of dotAll `.`/`s` - this repo's `tsconfig.json`
  // targets ES2017, which predates both named capture groups and the `s`
  // regex flag.
  private static readonly EVENT_PATTERN =
    /<a href="(https:\/\/www\.eventbrite\.[a-z.]+\/e\/[^"]+)"[^>]*data-event-id="(\d+)"[^>]*data-event-location="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*?<h3[^>]*>([^<]+)<\/h3><\/a><p[^>]*>([^<]+)<\/p>/g;

  protected async discover(): Promise<DiscoverResult> {
    const now = new Date();
    const allHackathons: ParsedHackathon[] = [];
    const errors: string[] = [];
    let hardFailures = 0;

    const dropped: Required<
      Pick<DroppedCounts, "byClassifier" | "byDateWindow">
    > = {
      byClassifier: 0,
      byDateWindow: 0,
    };
    let droppedByUnparseableDate = 0;

    for (const [index, slug] of this.countrySlugs.entries()) {
      if (index > 0) {
        await this.sleep(this.countryDelayMs);
      }

      try {
        const rawEvents = await this.fetchCountryDirectory(slug);
        const country_code = europeanCountries.normalizeCountry(
          slug.replace(/-/g, " "),
        );

        const stats: EventbriteDropStats = {
          droppedByClassifier: 0,
          excludedPastFutureWindow: 0,
          droppedByUnparseableDate: 0,
        };

        const hackathons = rawEvents
          .map((event) =>
            this.mapEventToHackathon(event, country_code, now, stats),
          )
          .filter(
            (hackathon): hackathon is ParsedHackathon => hackathon !== null,
          );

        dropped.byClassifier += stats.droppedByClassifier;
        dropped.byDateWindow += stats.excludedPastFutureWindow;
        droppedByUnparseableDate += stats.droppedByUnparseableDate;

        console.log(
          `Eventbrite [${slug}]: extracted ${rawEvents.length} unique raw ` +
            `event(s), matched ${hackathons.length} hackathon(s), dropped ` +
            `${stats.droppedByClassifier} by classifier, ` +
            `${stats.excludedPastFutureWindow} beyond the ${MAX_FUTURE_DAYS}-day ` +
            `future window, ${stats.droppedByUnparseableDate} with an unparseable date`,
        );

        allHackathons.push(...hackathons);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error(`Error fetching Eventbrite directory ${slug}:`, error);
        errors.push(`[${slug}] ${message}`);
        hardFailures++;
      }
    }

    let status: ParseStatus;
    if (errors.length === 0) {
      status = "ok";
    } else if (hardFailures >= this.countrySlugs.length) {
      status = "failed";
    } else {
      status = "partial";
    }

    const totalDropped = dropped.byClassifier + dropped.byDateWindow;

    console.log(
      `eventbrite: ${allHackathons.length} found, ${totalDropped} dropped ` +
        `(classifier: ${dropped.byClassifier}, date: ${dropped.byDateWindow}), ` +
        `${droppedByUnparseableDate} with an unparseable date`,
    );

    return { hackathons: allHackathons, errors, status, dropped };
  }

  private async fetchCountryDirectory(
    slug: string,
  ): Promise<EventbriteRawEvent[]> {
    const url = `${this.baseUrl}/${slug}/hackathon/`;

    const response = await fetchWithRetry(url, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Eventbrite directory page HTTP ${response.status} for ${url}`,
      );
    }

    const html = await response.text();
    return this.extractEvents(html);
  }

  /** Extracts and dedupes (by event id) the raw event cards in a page. */
  private extractEvents(html: string): EventbriteRawEvent[] {
    const byId = new Map<string, EventbriteRawEvent>();
    const pattern = new RegExp(EventbriteParser.EVENT_PATTERN);

    for (const match of html.matchAll(pattern)) {
      const [, url, id, location, name, date] = match;
      if (!id || !url || !name || !date) {
        continue;
      }

      if (!byId.has(id)) {
        byId.set(id, {
          id,
          url,
          name,
          location: location ?? "",
          dateText: date,
        });
      }
    }

    return Array.from(byId.values());
  }

  private mapEventToHackathon(
    event: EventbriteRawEvent,
    country_code: string | undefined,
    now: Date,
    stats: EventbriteDropStats,
  ): ParsedHackathon | null {
    try {
      const name = this.decodeHtmlEntities(event.name).trim();

      if (!name) {
        return null;
      }

      const classification = classifyHackathon(name);

      if (classification.decision === "borderline") {
        console.warn(
          `Eventbrite classifier BORDERLINE (score ${classification.score}) for "${name}": ${classification.reason}`,
        );
      } else {
        console.log(
          `Eventbrite classifier ${classification.decision.toUpperCase()} (score ${classification.score}) for "${name}": ${classification.reason}`,
        );
      }

      if (!classification.isHackathon) {
        stats.droppedByClassifier++;
        return null;
      }

      const start = this.parseEventbriteDate(event.dateText, now);

      if (!start) {
        stats.droppedByUnparseableDate++;
        console.log(
          `Eventbrite: dropping "${name}" - could not parse date text "${event.dateText}".`,
        );
        return null;
      }

      if (start < now) {
        return null;
      }

      if (start > getMaxFutureCutoff(now)) {
        stats.excludedPastFutureWindow++;
        return null;
      }

      const city = europeanCountries.normalizeCity(
        event.location.split(",")[0]?.trim(),
      );

      return {
        name,
        city,
        country_code,
        location_confidence: country_code ? "high" : undefined,
        location_type: "physical",
        date_start: start,
        topics: this.extractTopics(name),
        url: event.url,
        source: "eventbrite",
      };
    } catch (error) {
      console.error(`Error mapping Eventbrite event ${event.name}:`, error);
      return null;
    }
  }

  /**
   * Decodes HTML entities found in real titles (verified live, 2026-09-01 -
   * e.g. a French event's `L&#x27;IA au service de l&#x27;égalité`, which a
   * fixed named-entity list alone would miss). Named entities are handled
   * explicitly; numeric entities (decimal `&#39;` and hex `&#x27;`) are
   * decoded generically via `String.fromCodePoint`. `&amp;` is deliberately
   * decoded last so it can't re-introduce a `&` that then gets
   * misinterpreted as the start of another entity.
   */
  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_, dec: string) =>
        String.fromCodePoint(Number.parseInt(dec, 10)),
      )
      .replace(/&amp;/g, "&");
  }

  /**
   * Parses Eventbrite's directory-page date text (no year, several shapes -
   * see class doc comment) into a concrete UTC `Date`. Returns `null` when
   * the text doesn't match any recognized shape rather than guessing.
   */
  private parseEventbriteDate(rawText: string, now: Date): Date | null {
    const cleaned = rawText.replace(/\s*\+\s*\d+\s*more\s*$/i, "").trim();

    const todayMatch = cleaned.match(/^today\s+at\s+(.+)$/i);
    if (todayMatch) {
      const time = this.parseTimeOfDay(todayMatch[1]);
      if (!time) return null;

      return new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          time.hours,
          time.minutes,
        ),
      );
    }

    const weekdayMatch = cleaned.match(
      /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+at\s+(.+)$/i,
    );
    if (weekdayMatch) {
      const time = this.parseTimeOfDay(weekdayMatch[2]);
      if (!time) return null;

      const targetWeekday = WEEKDAYS.indexOf(weekdayMatch[1].toLowerCase());
      const dayOfMonth = this.resolveNextWeekday(now, targetWeekday);

      return new Date(
        Date.UTC(
          dayOfMonth.getUTCFullYear(),
          dayOfMonth.getUTCMonth(),
          dayOfMonth.getUTCDate(),
          time.hours,
          time.minutes,
        ),
      );
    }

    // Normal shape: "Thu, Nov 12, 5:00 PM" - weekday name is not needed for
    // parsing, only month/day/time.
    const normalMatch = cleaned.match(
      /^\w{3,},\s*([a-z]{3})[a-z]*\s+(\d{1,2}),\s*(.+)$/i,
    );
    if (normalMatch) {
      const monthIndex = MONTHS.indexOf(normalMatch[1].toLowerCase());
      if (monthIndex === -1) return null;

      const day = Number.parseInt(normalMatch[2], 10);
      const time = this.parseTimeOfDay(normalMatch[3]);
      if (!time) return null;

      const currentYear = now.getUTCFullYear();
      let candidate = new Date(
        Date.UTC(currentYear, monthIndex, day, time.hours, time.minutes),
      );

      // Year-less date already elapsed this year -> assume it refers to
      // next year instead of silently treating it as a past event.
      if (candidate < now) {
        candidate = new Date(
          Date.UTC(currentYear + 1, monthIndex, day, time.hours, time.minutes),
        );
      }

      return candidate;
    }

    return null;
  }

  private parseTimeOfDay(
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

  /** Next occurrence (UTC calendar date) of `targetWeekday` (0=Sun) from `now`, never in the past. */
  private resolveNextWeekday(now: Date, targetWeekday: number): Date {
    const base = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const currentWeekday = base.getUTCDay();

    let diff = targetWeekday - currentWeekday;
    if (diff < 0) diff += 7;

    base.setUTCDate(base.getUTCDate() + diff);
    return base;
  }
}
