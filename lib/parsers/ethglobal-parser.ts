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

      const stats = { excludedPastFutureWindow: 0 };
      const hackathons = events
        .map((event) => this.mapEventToHackathon(event, stats))
        .filter(
          (hackathon): hackathon is ParsedHackathon => hackathon !== null,
        );

      console.log(
        `ETHGlobal: extracted ${events.length} raw event(s), matched ` +
          `${hackathons.length} European/undetermined hackathons, excluded ` +
          `${stats.excludedPastFutureWindow} beyond the ${MAX_FUTURE_DAYS}-day ` +
          `future window`,
      );

      const status: ParseStatus = "ok";
      return { hackathons, errors: [], status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error in ETHGlobal parser:", error);
      return { hackathons: [], errors: [message], status: "failed" };
    }
  }

  /**
   * Finds every embedded event object of type "hackathon" in the page's
   * RSC payload via brace-depth matching (see class doc comment), then
   * un-escapes and JSON-parses each one independently so a single
   * malformed object doesn't prevent extracting the rest.
   */
  private extractEvents(html: string): EthGlobalEvent[] {
    const marker = '\\"type\\":\\"hackathon\\"';
    const events: EthGlobalEvent[] = [];
    const seenStarts = new Set<number>();

    let searchFrom = 0;
    let markerIndex: number;

    while ((markerIndex = html.indexOf(marker, searchFrom)) !== -1) {
      searchFrom = markerIndex + marker.length;

      const start = this.findEnclosingObjectStart(html, markerIndex);
      if (start === -1 || seenStarts.has(start)) {
        continue;
      }
      seenStarts.add(start);

      const end = this.findMatchingObjectEnd(html, start);
      if (end === -1) {
        continue;
      }

      const raw = html.slice(start, end + 1).replace(/\\"/g, '"');

      try {
        const obj = JSON.parse(raw) as EthGlobalEvent;
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

  /** Scans backward from `pos` to find the `{` that opens the object containing it. */
  private findEnclosingObjectStart(html: string, pos: number): number {
    let depth = 0;
    for (let i = pos; i >= 0; i--) {
      if (html[i] === "}") {
        depth++;
      } else if (html[i] === "{") {
        if (depth === 0) {
          return i;
        }
        depth--;
      }
    }
    return -1;
  }

  /** Scans forward from an object's opening `{` at `start` to find its matching `}`. */
  private findMatchingObjectEnd(html: string, start: number): number {
    let depth = 0;
    for (let i = start; i < html.length; i++) {
      if (html[i] === "{") {
        depth++;
      } else if (html[i] === "}") {
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
    stats: { excludedPastFutureWindow: number },
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
