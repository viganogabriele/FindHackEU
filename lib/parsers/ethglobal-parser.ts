import {
  BaseParser,
  ParsedHackathon,
  DiscoverResult,
  ParseStatus,
} from "@/lib/parsers/base-parser";

/**
 * Per-run counters for the reject points this file already had (date
 * window, non-European country) - just surfaced through the return value
 * instead of only console.log (issue #31). ETHGlobal's events listing is
 * already scoped to type "hackathon" (filtered in extractEvents()), so
 * there's no separate classify-vs-reject step here (unlike Luma).
 */
interface EthGlobalDropStats {
  excludedPastFutureWindow: number;
  droppedByCountry: number;
}
import { europeanCountries } from "@/lib/european-countries";
import {
  MAX_FUTURE_DAYS,
  getMaxFutureCutoff,
} from "@/lib/config/discovery-config";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

interface EthGlobalCity {
  name?: string;
  countryCode?: string;
}

interface EthGlobalEvent {
  id: number;
  name: string;
  slug: string;
  type: string;
  medium?: string;
  startTime?: string;
  endTime?: string;
  city?: EthGlobalCity | null;
}

/**
 * ethglobal.com has no public API (`api.ethglobal.com/events` returns 403)
 * and no embedded schema.org structured-data script tag on either the
 * listing or individual event pages (a format this project does not parse
 * at all today - see issue #35's "case 6" test for that gap).
 * Verified live, 2026-09-01: the `/events` listing page embeds a complete,
 * clean array of event objects (including a structured `city.countryCode`,
 * the same 2-letter-ISO shape as Luma/MLH) inside a Next.js RSC streaming
 * payload (`self.__next_f.push(...)` script tags) — but that payload is a
 * JS string literal, not standalone JSON: object braces are NOT escaped,
 * only quotes are (`\"key\":\"value\"`), which is what makes the
 * brace-depth extraction below reliable rather than a plain regex scrape.
 *
 * This is inherently more fragile than the other parsers here (an
 * undocumented internal data shape embedded in a framework's rendering
 * output, not even an undocumented-but-dedicated JSON endpoint like
 * Luma/Devfolio) - if ETHGlobal's site changes how this page renders,
 * `extractEvents()` will most likely start throwing (a missing/malformed
 * `<script>` tag or unbalanced braces), which surfaces as an honest
 * `status: "failed"` rather than silently returning stale/wrong data.
 *
 * A live check at implementation time found zero upcoming European events
 * (only Mumbai, Tokyo, and a virtual "ETHOnline 2026" were future-dated) -
 * this is a snapshot of ETHGlobal's current calendar, not a sign the
 * source is unproductive: they run real, well-attended European events
 * periodically (e.g. ETHGlobal Lisbon 2026, already finished by the time
 * of this check), so this provider's yield is expected to be sporadic
 * rather than empty over time.
 */
export class EthGlobalParser extends BaseParser {
  readonly name = "ethglobal";
  readonly enabled = true;

  private readonly eventsUrl = "https://ethglobal.com/events";

  protected async discover(): Promise<DiscoverResult> {
    try {
      const response = await fetchWithRetry(this.eventsUrl, {
        headers: {
          Accept: "text/html",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`ETHGlobal events page HTTP ${response.status}`);
      }

      const html = await response.text();
      const events = this.extractEvents(html);

      const stats: EthGlobalDropStats = {
        excludedPastFutureWindow: 0,
        droppedByCountry: 0,
      };
      const hackathons = events
        .map((event) => this.mapEventToHackathon(event, stats))
        .filter(
          (hackathon): hackathon is ParsedHackathon => hackathon !== null,
        );

      console.log(
        `ETHGlobal: extracted ${events.length} raw event(s), matched ` +
          `${hackathons.length} European/undetermined hackathons, excluded ` +
          `${stats.excludedPastFutureWindow} beyond the ${MAX_FUTURE_DAYS}-day ` +
          `future window, dropped ${stats.droppedByCountry} as non-European`,
      );

      const status: ParseStatus = "ok";
      const dropped = {
        byDateWindow: stats.excludedPastFutureWindow,
        byCountry: stats.droppedByCountry,
      };
      const totalDropped = dropped.byDateWindow + dropped.byCountry;

      console.log(
        `ethglobal: ${hackathons.length} found, ${totalDropped} dropped ` +
          `(date: ${dropped.byDateWindow}, country: ${dropped.byCountry})`,
      );

      return { hackathons, errors: [], status, dropped };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error in ETHGlobal parser:", error);
      return { hackathons: [], errors: [message], status: "failed" };
    }
  }

  /**
   * Finds every embedded event object of type "hackathon" in the page's
   * RSC payload via brace-depth matching (see class doc comment), then
   * un-escapes and JSON-parses each one independently so a single malformed
   * object doesn't prevent extracting the rest. The matching scanner
   * understands JSON strings, because braces in an event name/description
   * are data, not object delimiters.
   */
  private extractEvents(html: string): EthGlobalEvent[] {
    const marker = '\\"type\\":\\"hackathon\\"';
    const events: EthGlobalEvent[] = [];
    const seenStarts = new Set<number>();

    let searchFrom = 0;
    let markerIndex: number;

    while ((markerIndex = html.indexOf(marker, searchFrom)) !== -1) {
      searchFrom = markerIndex + marker.length;

      const object = this.findEventObjectContainingMarker(html, markerIndex);
      if (!object || seenStarts.has(object.start)) {
        continue;
      }
      seenStarts.add(object.start);

      try {
        const obj = JSON.parse(object.raw) as EthGlobalEvent;
        if (obj.type === "hackathon") {
          events.push(obj);
        }
      } catch {
        // Skip a single malformed object rather than failing the whole
        // page - other events on the same page are independent.
        continue;
      }
    }

    if (events.length === 0) {
      throw new Error(
        "No embedded hackathon event objects found in the ETHGlobal events page - the page structure may have changed",
      );
    }

    return events;
  }

  private findEventObjectContainingMarker(
    html: string,
    markerIndex: number,
  ): { start: number; raw: string } | null {
    // Search candidates from the marker backwards. A brace inside a string
    // may look like an object start in the raw RSC text, so only accept a
    // candidate whose quote-aware match can also be parsed as JSON.
    for (let start = markerIndex; start >= 0; start--) {
      if (html[start] !== "{") continue;

      const end = this.findMatchingObjectEnd(html, start);
      if (end < markerIndex) continue;

      const raw = this.decodeRscJson(html.slice(start, end + 1));
      try {
        const object = JSON.parse(raw) as { type?: unknown };
        if (object.type === "hackathon") {
          return { start, raw };
        }
      } catch {
        // Try the next enclosing brace.
      }
    }

    return null;
  }

  /**
   * Decode the escaped quotes used by the RSC string without changing other
   * JSON escape sequences. This keeps braces inside string values available
   * to the normal JSON-aware depth scanner below.
   */
  private decodeRscJson(raw: string): string {
    let decoded = "";

    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "\\" && raw[i + 1] === '"') {
        decoded += '"';
        i++;
      } else {
        decoded += raw[i];
      }
    }

    return decoded;
  }

  /** Scans forward from an object's opening `{` to find its matching `}`. */
  private findMatchingObjectEnd(html: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < html.length; i++) {
      let character = html[i];

      // RSC escapes every JSON quote once for the surrounding JavaScript
      // string. Preserve backslashes that belong to JSON string escapes;
      // decode only the outer `\\"` representation.
      if (character === "\\" && html[i + 1] === '"') {
        character = '"';
        i++;
      }

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
      } else if (character === "{") {
        depth++;
      } else if (character === "}") {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }

  private mapEventToHackathon(
    event: EthGlobalEvent,
    stats: EthGlobalDropStats,
  ): ParsedHackathon | null {
    try {
      if (!event.name || !event.startTime || !event.slug) {
        return null;
      }

      const dates = this.formatDate(event.startTime, event.endTime);
      const now = new Date();

      if (dates.start < now) {
        return null;
      }

      if (dates.start > getMaxFutureCutoff(now)) {
        stats.excludedPastFutureWindow++;
        return null;
      }

      const explicitCountry = event.city?.countryCode;

      if (
        europeanCountries.classifyCountryCode(explicitCountry) ===
        "non_european"
      ) {
        stats.droppedByCountry++;
        console.log(
          `Dropping ETHGlobal event "${event.name}": explicit country ${explicitCountry} is not European.`,
        );
        return null;
      }

      const country_code = europeanCountries.normalizeCountry(explicitCountry);
      const city = europeanCountries.normalizeCity(event.city?.name);

      const location_confidence: ParsedHackathon["location_confidence"] =
        country_code ? "high" : undefined;

      return {
        name: event.name.trim(),
        city,
        country_code,
        location_confidence,
        // ETHGlobal's own `medium` field is an explicit structured signal
        // (issue #21). Map only values with a known meaning; a future or
        // malformed value must not silently become an online event.
        location_type:
          event.medium === "physical"
            ? "physical"
            : event.medium === "virtual" || event.medium === "online"
              ? "online"
              : event.medium === "hybrid" || event.medium === "hybrid_physical"
                ? "hybrid"
                : "tbd",
        date_start: dates.start,
        date_end: dates.end,
        topics: this.extractTopics(event.name),
        url: `https://ethglobal.com/events/${event.slug}`,
        source: "ethglobal",
      };
    } catch (error) {
      console.error(`Error mapping ETHGlobal event ${event.name}:`, error);
      return null;
    }
  }
}
