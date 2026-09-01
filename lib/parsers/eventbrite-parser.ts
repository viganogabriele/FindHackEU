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
import {
  parseEventbriteDates,
  type EventbriteStructuredDate,
} from "@/lib/parsers/eventbrite-date";

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
  structured?: EventbriteStructuredEvent;
}

interface EventbriteStructuredVenue {
  name?: string;
  address?: {
    city?: string;
    country?: string;
    region?: string;
  };
}

interface EventbriteStructuredEvent extends EventbriteStructuredDate {
  id: string;
  name?: string;
  url?: string;
  primary_venue?: EventbriteStructuredVenue;
  is_online_event?: boolean;
}

interface EventbritePageExtraction {
  events: EventbriteRawEvent[];
  pageNumber?: number;
  pageCount?: number;
  continuation?: string;
  hasExpectedMarkup: boolean;
}

interface JsonObject {
  [key: string]: unknown;
}

function asJsonObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

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
 *   (`countrySlugs` below), all returning HTTP 200 with real event data in
 *   both the rendered cards and the `window.__SERVER_DATA__` payload.
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
 *    The structured `window.__SERVER_DATA__` fields are preferred when they
 *    include a local start date/time and timezone (and preserve an end date);
 *    the card text below is the timezone-aware fallback.
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
 * country is never in this field). The structured payload also carries a
 * primary venue and an `is_online_event` flag; those fields take precedence
 * when present. Since each directory page is fetched for one specific
 * country slug, the country is known unambiguously from which page was
 * fetched. Some rows have an empty region after the comma (e.g.
 * `"Hamburg, "`, observed live) - handled gracefully.
 *
 * `location_type` uses Eventbrite's structured `is_online_event` signal when
 * available, maps an explicitly online/virtual card to `online`, and maps an
 * unannounced venue such as `TBD` to `tbd`. A concrete venue otherwise maps
 * to `physical`; the parser never infers `physical` from a missing venue.
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

  // Small delay between successive directory requests, same reasoning as
  // LumaParser's pageDelayMs: this parser fetches at least 15 country pages
  // from the same host in one run - a short, polite gap between requests
  // costs a few seconds of wall-clock time in exchange for being a much
  // better citizen against a host we have no formal API agreement with
  // (unlike Luma's own inter-page delay, robots.txt/live checks earlier
  // today didn't surface any documented per-request rate limit for these
  // directory pages, so this value is a conservative default, not a
  // measured one).
  private readonly countryDelayMs = 500;

  // Eventbrite reports a very large result count for some directory queries.
  // Keep the crawl bounded while still going beyond the first 20-result page.
  // The cap is configurable for local probes without allowing an unbounded
  // request loop.
  private readonly maxPagesPerCountry =
    EventbriteParser.resolveMaxPagesPerCountry();

  private static resolveMaxPagesPerCountry(): number {
    const raw = process.env.EVENTBRITE_MAX_PAGES_PER_COUNTRY;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;

    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10) : 5;
  }

  private readonly countryTimezones: Record<string, string> = {
    AT: "Europe/Vienna",
    BE: "Europe/Brussels",
    CH: "Europe/Zurich",
    DE: "Europe/Berlin",
    DK: "Europe/Copenhagen",
    ES: "Europe/Madrid",
    FI: "Europe/Helsinki",
    FR: "Europe/Paris",
    GB: "Europe/London",
    IE: "Europe/Dublin",
    IT: "Europe/Rome",
    NL: "Europe/Amsterdam",
    PL: "Europe/Warsaw",
    PT: "Europe/Lisbon",
    SE: "Europe/Stockholm",
  };

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Eventbrite currently renders each result more than once (for example, a
   * thumbnail and a details card). These patterns deliberately capture
   * generic anchors/headings/paragraphs rather than relying on one exact
   * attribute order or whitespace layout. Results are deduped by ID after
   * extraction.
   */
  private static readonly ANCHOR_PATTERN = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  private static readonly HEADING_PATTERN =
    /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i;
  private static readonly PARAGRAPH_PATTERN = /<p\b[^>]*>([\s\S]*?)<\/p>/i;

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
        const directory = await this.fetchCountryDirectory(slug);
        const rawEvents = directory.events;
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

        if (directory.truncated) {
          const truncationMessage =
            "stopped at the " +
            this.maxPagesPerCountry +
            '-page limit while Eventbrite still reported more results for "' +
            slug +
            '" - some events were not fetched this run';

          console.warn("Eventbrite [" + slug + "]: " + truncationMessage + ".");
          errors.push("[" + slug + "] " + truncationMessage);
        }
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
  ): Promise<{ events: EventbriteRawEvent[]; truncated: boolean }> {
    const allEvents = new Map<string, EventbriteRawEvent>();
    let page = 1;
    let pageCount: number | undefined;
    let continuation: string | undefined;
    let truncated = false;

    while (page <= this.maxPagesPerCountry) {
      if (page > 1) {
        await this.sleep(this.countryDelayMs);
      }

      const extraction = await this.fetchDirectoryPage(slug, page);

      if (extraction.hasExpectedMarkup && extraction.events.length === 0) {
        throw new Error(
          'Eventbrite directory page for "' +
            slug +
            '" page ' +
            page +
            " contained expected event markup, but no events could be extracted",
        );
      }

      for (const event of extraction.events) {
        allEvents.set(event.id, event);
      }

      pageCount = extraction.pageCount ?? pageCount;
      continuation = extraction.continuation;

      const currentPage = extraction.pageNumber ?? page;
      const hasNextPage =
        (pageCount !== undefined && currentPage < pageCount) ||
        (pageCount === undefined && Boolean(continuation));

      if (!hasNextPage) {
        break;
      }

      if (page >= this.maxPagesPerCountry) {
        truncated = true;
        break;
      }

      page++;
    }

    return { events: Array.from(allEvents.values()), truncated };
  }

  private async fetchDirectoryPage(
    slug: string,
    page: number,
  ): Promise<EventbritePageExtraction> {
    const url = new URL(this.baseUrl + "/" + slug + "/hackathon/");

    if (page > 1) {
      url.searchParams.set("page", page.toString());
    }

    const response = await fetchWithRetry(url.toString(), {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(
        "Eventbrite directory page HTTP " +
          response.status +
          " for " +
          url.toString(),
      );
    }

    const html = await response.text();
    return this.extractEvents(html);
  }

  /**
   * Extracts and dedupes raw events from both the rendered cards and the
   * structured server payload. The two views are merged by Eventbrite ID:
   * cards provide the display text while the payload provides authoritative
   * dates, timezone, venue, and online status.
   */
  private extractEvents(html: string): EventbritePageExtraction {
    const structuredPage = this.extractStructuredPage(html);
    const byId = new Map<string, EventbriteRawEvent>();

    for (const event of this.extractCardEvents(html)) {
      byId.set(event.id, event);
    }

    for (const structured of structuredPage.events) {
      const existing = byId.get(structured.id);
      const structuredLocation = this.getStructuredLocation(structured);

      if (existing) {
        byId.set(structured.id, {
          ...existing,
          name: existing.name || structured.name || "",
          url: existing.url || this.normalizeEventUrl(structured.url || ""),
          location: existing.location || structuredLocation,
          structured,
        });
      } else if (structured.name && structured.url) {
        byId.set(structured.id, {
          id: structured.id,
          name: structured.name,
          url: this.normalizeEventUrl(structured.url),
          location: structuredLocation,
          dateText: "",
          structured,
        });
      }
    }

    const hasExpectedMarkup =
      /\bdata-event-id\b/i.test(html) ||
      html.includes("window.__SERVER_DATA__") ||
      /["']eventbrite_event_id["']\s*:/i.test(html);

    return {
      events: Array.from(byId.values()).filter((event) =>
        Boolean(event.id && event.url && event.name),
      ),
      pageNumber: structuredPage.pageNumber,
      pageCount: structuredPage.pageCount,
      continuation: structuredPage.continuation,
      hasExpectedMarkup,
    };
  }

  private extractCardEvents(html: string): EventbriteRawEvent[] {
    const byId = new Map<string, EventbriteRawEvent>();
    const pattern = new RegExp(EventbriteParser.ANCHOR_PATTERN);

    for (const match of html.matchAll(pattern)) {
      const attributes = this.parseAttributes(match[1] || "");
      const id = attributes["data-event-id"];
      const rawUrl = attributes.href;

      if (!id || !rawUrl) {
        continue;
      }

      const url = this.normalizeEventUrl(rawUrl);
      if (!url) {
        continue;
      }

      const innerHtml = match[2] || "";
      const headingMatch = innerHtml.match(
        new RegExp(EventbriteParser.HEADING_PATTERN),
      );
      const name = headingMatch
        ? this.extractTextContent(headingMatch[1] || "")
        : this.extractAriaLabel(attributes["aria-label"] || "");

      const matchEnd = (match.index ?? 0) + match[0].length;
      const nextAnchor = html.slice(matchEnd).search(/<a\b/i);
      const afterAnchor = html.slice(
        matchEnd,
        nextAnchor === -1 ? matchEnd + 4000 : matchEnd + nextAnchor,
      );
      const paragraphMatch = afterAnchor.match(
        new RegExp(EventbriteParser.PARAGRAPH_PATTERN),
      );
      const dateText = paragraphMatch
        ? this.extractTextContent(paragraphMatch[1] || "")
        : "";

      const previous = byId.get(id);
      byId.set(id, {
        id,
        url: previous?.url || url,
        name: previous?.name || name,
        location: previous?.location || attributes["data-event-location"] || "",
        dateText: previous?.dateText || dateText,
      });
    }

    return Array.from(byId.values());
  }

  private extractStructuredPage(html: string): {
    events: EventbriteStructuredEvent[];
    pageNumber?: number;
    pageCount?: number;
    continuation?: string;
  } {
    const value = this.extractJsonAssignment(html, "window.__SERVER_DATA__");
    const root = asJsonObject(value);
    const searchData = asJsonObject(root?.search_data);
    const eventsData = asJsonObject(searchData?.events);
    const pagination = asJsonObject(eventsData?.pagination);
    const results = Array.isArray(eventsData?.results)
      ? eventsData.results
      : [];

    return {
      events: results
        .map((result) => this.toStructuredEvent(result))
        .filter((event): event is EventbriteStructuredEvent => event !== null),
      pageNumber: asNumber(pagination?.page_number),
      pageCount: asNumber(pagination?.page_count),
      continuation: asString(pagination?.continuation),
    };
  }

  private toStructuredEvent(value: unknown): EventbriteStructuredEvent | null {
    const object = asJsonObject(value);
    const id = asString(object?.eventbrite_event_id) || asString(object?.id);

    if (!id) {
      return null;
    }

    const venue = asJsonObject(object?.primary_venue);
    const address = asJsonObject(venue?.address);

    return {
      id,
      name: asString(object?.name),
      url: asString(object?.url),
      start_date: asString(object?.start_date),
      start_time: asString(object?.start_time),
      timezone: asString(object?.timezone),
      end_date: asString(object?.end_date),
      end_time: asString(object?.end_time),
      primary_venue: venue
        ? {
            name: asString(venue.name),
            address: address
              ? {
                  city: asString(address.city),
                  country: asString(address.country),
                  region: asString(address.region),
                }
              : undefined,
          }
        : undefined,
      is_online_event: asBoolean(object?.is_online_event),
    };
  }

  private getStructuredLocation(event: EventbriteStructuredEvent): string {
    const city = event.primary_venue?.address?.city;
    const region = event.primary_venue?.address?.region;

    if (!city) {
      return "";
    }

    return region ? city + ", " + region : city;
  }

  private parseAttributes(value: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const pattern = /([^\s=/>]+)\s*=\s*(["'])([\s\S]*?)\2/g;

    for (const match of value.matchAll(pattern)) {
      const [, name, , attributeValue] = match;

      if (name && attributeValue !== undefined) {
        attributes[name.toLowerCase()] =
          this.decodeHtmlEntities(attributeValue);
      }
    }

    return attributes;
  }

  private extractTextContent(value: string): string {
    return this.decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractAriaLabel(value: string): string {
    return value.replace(/^view(?:\s+event)?\s*:?\s*/i, "").trim();
  }

  private normalizeEventUrl(rawUrl: string): string {
    try {
      const url = new URL(rawUrl, "https://www.eventbrite.com");

      if (!url.pathname.includes("/e/")) {
        return "";
      }

      for (const key of Array.from(url.searchParams.keys())) {
        if (key.toLowerCase() === "aff") {
          url.searchParams.delete(key);
        }
      }

      return url.toString();
    } catch {
      return "";
    }
  }

  private extractJsonAssignment(html: string, marker: string): unknown {
    const markerIndex = html.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    const start = this.findJsonValueStart(html, markerIndex + marker.length);
    if (start === -1) {
      return null;
    }

    const end = this.findJsonValueEnd(html, start);
    if (end === -1) {
      return null;
    }

    try {
      return JSON.parse(html.slice(start, end)) as unknown;
    } catch {
      return null;
    }
  }

  private findJsonValueStart(html: string, from: number): number {
    for (let index = from; index < html.length; index++) {
      if (html[index] === "{" || html[index] === "[") {
        return index;
      }

      if (!/\s|=/.test(html[index] || "")) {
        return -1;
      }
    }

    return -1;
  }

  private findJsonValueEnd(html: string, start: number): number {
    const opener = html[start];
    const closer = opener === "{" ? "}" : opener === "[" ? "]" : "";

    if (!closer) {
      return -1;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < html.length; index++) {
      const character = html[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }

        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === opener) {
        depth++;
      } else if (character === closer) {
        depth--;

        if (depth === 0) {
          return index + 1;
        }
      }
    }

    return -1;
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

      const dates = parseEventbriteDates(
        event,
        country_code,
        now,
        this.countryTimezones,
      );

      if (!dates) {
        stats.droppedByUnparseableDate++;
        console.log(
          `Eventbrite: dropping "${name}" - could not parse date text "${event.dateText}".`,
        );
        return null;
      }

      if (dates.start < now) {
        return null;
      }

      if (dates.start > getMaxFutureCutoff(now)) {
        stats.excludedPastFutureWindow++;
        return null;
      }

      const city = this.getEventCity(event);

      return {
        name,
        city,
        country_code,
        location_confidence: country_code ? "high" : undefined,
        location_type: this.mapLocationType(event, city),
        date_start: dates.start,
        date_end: dates.end,
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

  private getEventCity(event: EventbriteRawEvent): string | undefined {
    if (event.structured?.is_online_event === true) {
      return undefined;
    }

    const structuredCity = event.structured?.primary_venue?.address?.city;
    const rawCity =
      structuredCity?.trim() || event.location.split(",")[0]?.trim();

    if (
      !rawCity ||
      this.isOnlineLocation(event) ||
      this.isTbdLocation(rawCity)
    ) {
      return undefined;
    }

    return europeanCountries.normalizeCity(rawCity);
  }

  private mapLocationType(
    event: EventbriteRawEvent,
    city: string | undefined,
  ): ParsedHackathon["location_type"] {
    if (
      event.structured?.is_online_event === true ||
      this.isOnlineLocation(event)
    ) {
      return "online";
    }

    const venueName = event.structured?.primary_venue?.name || "";
    if (this.isTbdLocation(event.location) || this.isTbdLocation(venueName)) {
      return "tbd";
    }

    return city || venueName.trim() || event.location.trim()
      ? "physical"
      : "tbd";
  }

  private isOnlineLocation(event: EventbriteRawEvent): boolean {
    const locationText = [
      event.location,
      event.structured?.primary_venue?.name || "",
      event.structured?.primary_venue?.address?.city || "",
    ].join(" ");

    return /\b(?:online|virtual|remote|digital)\b/i.test(locationText);
  }

  private isTbdLocation(value: string): boolean {
    return /\btbd\b|to be announced|not announced|location pending|venue pending/i.test(
      value,
    );
  }
}
