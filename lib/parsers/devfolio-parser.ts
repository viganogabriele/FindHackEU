import {
  BaseParser,
  ParsedHackathon,
  DiscoverResult,
  ParseStatus,
} from "@/lib/parsers/base-parser";

/**
 * Per-run counters for the reject points this file already had (date
 * window, non-European country) - just surfaced through the return value
 * instead of only console.log (issue #31). Devfolio's API is already
 * scoped to "hackathons" specifically, so there's no separate
 * classify-vs-reject step here (unlike Luma).
 */
interface DevfolioDropStats {
  excludedPastFutureWindow: number;
  droppedByCountry: number;
}
import { europeanCountries } from "@/lib/european-countries";
import {
  MAX_FUTURE_DAYS,
  getMaxFutureCutoff,
} from "@/lib/config/discovery-config";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

interface DevfolioHackathon {
  uuid: string;
  name: string;
  slug: string;
  tagline?: string;
  desc?: string;
  starts_at: string;
  ends_at?: string;
  is_online: boolean;
  city?: string | null;
  country?: string | null;
  location?: string | null;
}

interface DevfolioApiResponse {
  result: DevfolioHackathon[];
  count: number;
  pages: number;
}

/**
 * lib.devfolio.co/api/hackathons is an undocumented public endpoint (issue
 * #10's Fase 2 investigation, 2026-09-01): no auth required, but it is not a
 * published developer API, so its shape/availability could change without
 * notice. Verified live: no robots.txt restriction on api.devfolio.co, and
 * unlike Devpost's terms (which explicitly prohibit automated scraping),
 * no equivalent Devfolio restriction was found - re-check before relying on
 * this more heavily.
 *
 * Devfolio's own dataset is small and India-heavy (like Unstop/HackerEarth),
 * but - unlike Unstop, which had zero physical European events - a live
 * probe found real, currently-open European hackathons (e.g. "TUM
 * Blockchain & AI Hackathon" in Munich, Germany), so this is a genuine, if
 * modest, coverage addition rather than a India-only mirror.
 */
export class DevfolioParser extends BaseParser {
  readonly name = "devfolio";
  readonly enabled = true;

  private readonly baseUrl = "https://api.devfolio.co/api/hackathons";

  // These are Devfolio's own lifecycle filters for "not finished yet"
  // hackathons. There is no single "everything upcoming" filter, and
  // "all" also returns long-finished events, so querying these three and
  // deduplicating by uuid is the closest equivalent without pulling in
  // history irrelevant to discovery.
  private readonly filters = ["upcoming", "application_open", "live"];

  // Devfolio's live inventory in these filters is small (tens, not
  // thousands) - this bound exists purely as a safety net against an
  // unexpected future growth in listings, mirroring Luma's
  // maxPagesPerSlug pattern rather than a value tuned against real data.
  private readonly maxPagesPerFilter = 5;

  // Small delay between successive requests, including pagination pages -
  // same courtesy reasoning as LumaParser's pageDelayMs and EventbriteParser's
  // countryDelayMs. Low request volume here makes this less critical than for
  // Eventbrite's 15 requests/run, but the principle - don't hammer a host we
  // have no formal API agreement with - applies equally.
  private readonly requestDelayMs = 500;

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async discover(): Promise<DiscoverResult> {
    const byUuid = new Map<string, DevfolioHackathon>();
    const errors: string[] = [];
    let hardFailures = 0;

    for (const [index, filter] of this.filters.entries()) {
      if (index > 0) {
        await this.sleep(this.requestDelayMs);
      }

      try {
        const items = await this.fetchFilter(filter);
        for (const item of items) {
          byUuid.set(item.uuid, item);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error fetching Devfolio filter "${filter}":`, error);
        errors.push(`[${filter}] ${message}`);
        hardFailures++;
      }
    }

    const stats: DevfolioDropStats = {
      excludedPastFutureWindow: 0,
      droppedByCountry: 0,
    };
    const hackathons = Array.from(byUuid.values())
      .map((item) => this.mapEventToHackathon(item, stats))
      .filter((hackathon): hackathon is ParsedHackathon => hackathon !== null);

    console.log(
      `Devfolio: fetched ${byUuid.size} unique raw event(s) across ` +
        `${this.filters.length} filter(s), matched ${hackathons.length} ` +
        `European/undetermined hackathons, excluded ${stats.excludedPastFutureWindow} ` +
        `beyond the ${MAX_FUTURE_DAYS}-day future window, dropped ` +
        `${stats.droppedByCountry} as non-European`,
    );

    let status: ParseStatus;
    if (errors.length === 0) {
      status = "ok";
    } else if (hardFailures >= this.filters.length) {
      status = "failed";
    } else {
      status = "partial";
    }

    const dropped = {
      byDateWindow: stats.excludedPastFutureWindow,
      byCountry: stats.droppedByCountry,
    };
    const totalDropped = dropped.byDateWindow + dropped.byCountry;

    console.log(
      `devfolio: ${hackathons.length} found, ${totalDropped} dropped ` +
        `(date: ${dropped.byDateWindow}, country: ${dropped.byCountry})`,
    );

    return { hackathons, errors, status, dropped };
  }

  private async fetchFilter(filter: string): Promise<DevfolioHackathon[]> {
    const allItems: DevfolioHackathon[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= this.maxPagesPerFilter) {
      if (page > 1) {
        await this.sleep(this.requestDelayMs);
      }

      const url = `${this.baseUrl}?filter=${encodeURIComponent(filter)}&page=${page}`;

      const response = await fetchWithRetry(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Devfolio API HTTP ${response.status} for filter "${filter}"${
            body ? `: ${body}` : ""
          }`,
        );
      }

      const data: DevfolioApiResponse = await response.json();
      const items = Array.isArray(data.result) ? data.result : [];

      allItems.push(...items);
      totalPages = data.pages || 1;
      page++;
    }

    return allItems;
  }

  private mapEventToHackathon(
    item: DevfolioHackathon,
    stats: DevfolioDropStats,
  ): ParsedHackathon | null {
    try {
      if (!item.name || !item.starts_at || !item.slug) {
        return null;
      }

      const dates = this.formatDate(item.starts_at, item.ends_at);
      const now = new Date();

      if (dates.start < now) {
        return null;
      }

      if (dates.start > getMaxFutureCutoff(now)) {
        stats.excludedPastFutureWindow++;
        return null;
      }

      // Devfolio's `country` field is a full country name (e.g. "Germany",
      // "India"), not a 2-letter code - europeanCountries.classifyCountryCode()
      // was designed for exactly-2-letter codes vs. free text and would
      // wrongly bucket an unrecognized full name (e.g. "India") as
      // "unrecognized" (ambiguous, don't drop) rather than "non_european"
      // (a real country name that just isn't in Europe). Since `country`
      // here is authoritative structured source data - not ambiguous free
      // text - an explicit non-European name must be dropped directly,
      // the same way Luma drops an explicit non-European geo.country_code.
      let country_code: string | undefined;
      if (item.country) {
        country_code = europeanCountries.normalizeCountry(item.country);

        if (!country_code) {
          stats.droppedByCountry++;
          console.log(
            `Dropping Devfolio event "${item.name}": explicit country "${item.country}" is not European.`,
          );
          return null;
        }
      }

      const city = europeanCountries.normalizeCity(item.city ?? undefined);

      let location_confidence: ParsedHackathon["location_confidence"] =
        country_code ? "high" : undefined;

      if (!country_code && city) {
        const inferredCountry = europeanCountries.inferCountryFromCity(city);
        if (inferredCountry) {
          country_code = inferredCountry;
          location_confidence = "low";
        }
      }

      return {
        name: item.name.trim(),
        city,
        country_code,
        location_confidence,
        // Devfolio's `is_online` boolean is the only structured
        // online/physical signal in its API response (issue #21) - a live
        // fetch of the raw payload found no `hackathon_setting` field
        // distinguishing "hybrid" (it's a branding/UI-customization object,
        // not a location descriptor), so only these two values are mapped.
        location_type: item.is_online ? "online" : "physical",
        date_start: dates.start,
        date_end: dates.end,
        topics: this.extractTopics(item.name, item.desc, item.tagline),
        url: `https://${item.slug}.devfolio.co/`,
        source: "devfolio",
      };
    } catch (error) {
      console.error(`Error mapping Devfolio event ${item.name}:`, error);
      return null;
    }
  }
}
