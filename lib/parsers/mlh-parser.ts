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

interface MlhVenueAddress {
  city?: string;
  state?: string;
  country?: string;
}

interface MlhEvent {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  endsAt?: string;
  url: string;
  location?: string;
  formatType?: "physical" | "digital" | "hybrid_physical";
  websiteUrl?: string;
  venueAddress?: MlhVenueAddress | null;
}

interface MlhPageData {
  props?: {
    upcomingEvents?: MlhEvent[];
  };
}

/**
 * MLH rebuilt its site on Inertia.js + a separate `api.mlh.com` backend
 * (verified live, 2026-09-01): every `api.mlh.com` endpoint tried requires
 * authentication (401), unlike Luma/Devfolio's genuinely public JSON. The
 * actual usable public surface is the season page itself
 * (`mlh.com/seasons/{year}/events`), which embeds a full `upcomingEvents`
 * array as a JSON blob directly in server-rendered HTML (Inertia's
 * `data-page` script tag) - no auth required.
 *
 * MLH's "season" numbering is offset from the calendar year it's queried
 * in (e.g. season 2027 was the live one while season 2026 had already
 * ended, as of September 2026) - fetching both the current calendar year
 * and the next one and merging by event `id` is a deliberately simple way
 * to stay correct across that year-boundary drift without hardcoding a
 * fixed offset that could silently go stale.
 *
 * Coverage is real but small for Europe: a live probe found 1 genuinely
 * European physical event (DurHack, UK) out of 68 upcoming listings, plus
 * occasional worldwide-format digital events. This is MLH's official
 * member-event directory, not a general hackathon aggregator, so a small
 * European share is expected, not a parser bug.
 */
export class MlhParser extends BaseParser {
  readonly name = "mlh";
  readonly enabled = true;

  private readonly baseUrl = "https://www.mlh.com";

  private seasonsToCheck(): number[] {
    const currentYear = new Date().getUTCFullYear();
    return [currentYear, currentYear + 1];
  }

  protected async discover(): Promise<DiscoverResult> {
    const byId = new Map<string, MlhEvent>();
    const errors: string[] = [];
    let hardFailures = 0;
    const seasons = this.seasonsToCheck();

    for (const season of seasons) {
      try {
        const events = await this.fetchSeason(season);
        for (const event of events) {
          byId.set(event.id, event);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error fetching MLH season ${season}:`, error);
        errors.push(`[season ${season}] ${message}`);
        hardFailures++;
      }
    }

    const stats = { excludedPastFutureWindow: 0 };
    const hackathons = Array.from(byId.values())
      .map((event) => this.mapEventToHackathon(event, stats))
      .filter((hackathon): hackathon is ParsedHackathon => hackathon !== null);

    console.log(
      `MLH: fetched ${byId.size} unique raw event(s) across ${seasons.length} ` +
        `season(s), matched ${hackathons.length} European/undetermined ` +
        `hackathons, excluded ${stats.excludedPastFutureWindow} beyond the ` +
        `${MAX_FUTURE_DAYS}-day future window`,
    );

    let status: ParseStatus;
    if (errors.length === 0) {
      status = "ok";
    } else if (hardFailures >= seasons.length) {
      status = "failed";
    } else {
      status = "partial";
    }

    return { hackathons, errors, status };
  }

  private async fetchSeason(season: number): Promise<MlhEvent[]> {
    const url = `${this.baseUrl}/seasons/${season}/events`;

    const response = await fetchWithRetry(url, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`MLH season page HTTP ${response.status} for ${url}`);
    }

    const html = await response.text();
    const marker = 'type="application/json"';
    const markerIndex = html.indexOf(marker);

    if (markerIndex === -1) {
      throw new Error(
        `MLH season page for ${season} did not contain the expected embedded JSON script tag`,
      );
    }

    const start = html.indexOf(">", markerIndex) + 1;
    const end = html.indexOf("</script>", start);

    if (start <= 0 || end === -1) {
      throw new Error(
        `MLH season page for ${season} had a malformed embedded JSON script tag`,
      );
    }

    const data: MlhPageData = JSON.parse(html.slice(start, end));
    return data.props?.upcomingEvents ?? [];
  }

  /** Maps MLH's own `formatType` field to this project's location_type enum (issue #21). */
  private mapLocationType(
    formatType: MlhEvent["formatType"],
  ): ParsedHackathon["location_type"] {
    switch (formatType) {
      case "physical":
        return "physical";
      case "digital":
        return "online";
      case "hybrid_physical":
        return "hybrid";
      default:
        return "tbd";
    }
  }

  private mapEventToHackathon(
    event: MlhEvent,
    stats: { excludedPastFutureWindow: number },
  ): ParsedHackathon | null {
    try {
      if (!event.name || !event.startsAt || !event.slug) {
        return null;
      }

      const dates = this.formatDate(event.startsAt, event.endsAt);
      const now = new Date();

      if (dates.start < now) {
        return null;
      }

      if (dates.start > getMaxFutureCutoff(now)) {
        stats.excludedPastFutureWindow++;
        return null;
      }

      // venueAddress.country is already a 2-letter ISO code, the same
      // shape as Luma's geo.country_code - classifyCountryCode() applies
      // directly here (unlike Devfolio's full country names, which needed
      // their own handling).
      const explicitCountry = event.venueAddress?.country;

      if (
        europeanCountries.classifyCountryCode(explicitCountry) ===
        "non_european"
      ) {
        console.log(
          `Dropping MLH event "${event.name}": explicit country ${explicitCountry} is not European.`,
        );
        return null;
      }

      const country_code = europeanCountries.normalizeCountry(explicitCountry);
      const city = europeanCountries.normalizeCity(
        event.venueAddress?.city ?? undefined,
      );

      const location_confidence: ParsedHackathon["location_confidence"] =
        country_code ? "high" : undefined;

      return {
        name: event.name.trim(),
        city,
        country_code,
        location_confidence,
        // MLH's own `formatType` is an explicit structured signal
        // (issue #21) - map it directly rather than guessing from
        // city/country resolution.
        location_type: this.mapLocationType(event.formatType),
        date_start: dates.start,
        date_end: dates.end,
        topics: this.extractTopics(event.name),
        url: event.websiteUrl || `${this.baseUrl}${event.url}`,
        source: "mlh",
      };
    } catch (error) {
      console.error(`Error mapping MLH event ${event.name}:`, error);
      return null;
    }
  }
}
