import {
  BaseParser,
  DiscoverResult,
  ParsedHackathon,
  ParseStatus,
} from "@/lib/parsers/base-parser";
import { europeanCountries } from "@/lib/european-countries";
import {
  MAX_FUTURE_DAYS,
  getMaxFutureCutoff,
} from "@/lib/config/discovery-config";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

interface DevpostTheme {
  name?: string;
}

interface DevpostHackathon {
  id: number | string;
  title: string;
  url: string;
  submission_period_dates: string;
  displayed_location?: string | { location?: string } | null;
  themes?: Array<string | DevpostTheme>;
}

interface DevpostApiResponse {
  page?: number;
  hackathons?: DevpostHackathon[];
  total_count?: number;
  results_returned?: number;
}

interface DevpostDropStats {
  excludedPastFutureWindow: number;
  droppedByCountry: number;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Devpost's public listing endpoint is undocumented and returns dates as a
 * human-readable submission window, not ISO timestamps. The endpoint and
 * field names below were verified against the live listing surface on
 * 2026-09-01; keep malformed rows isolated so an API shape change is visible
 * in the source result rather than poisoning the whole update run.
 */
export class DevpostParser extends BaseParser {
  readonly name = "devpost";
  readonly enabled = true;

  private readonly baseUrl = "https://devpost.com/api/hackathons";
  private readonly perPage = 40;
  private readonly maxPages = 10;
  private readonly requestDelayMs = 500;

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async discover(): Promise<DiscoverResult> {
    const byId = new Map<string, DevpostHackathon>();
    const errors: string[] = [];
    let pagesFetched = 0;
    let totalCount = 0;

    try {
      for (let page = 1; page <= this.maxPages; page++) {
        if (page > 1) await this.sleep(this.requestDelayMs);

        const data = await this.fetchPage(page);
        pagesFetched++;
        totalCount = data.total_count ?? totalCount;

        if (!Array.isArray(data.hackathons)) {
          throw new Error(
            `Devpost page ${page} did not contain a hackathons array`,
          );
        }

        for (const item of data.hackathons) {
          if (item && item.id !== undefined) byId.set(String(item.id), item);
        }

        const returned = data.results_returned ?? data.hackathons.length;
        if (data.hackathons.length === 0) break;
        if (totalCount > 0) {
          const fetchedCount = (page - 1) * this.perPage + returned;
          if (fetchedCount >= totalCount) break;
        } else if (returned < this.perPage) {
          break;
        }
      }

      if (totalCount > pagesFetched * this.perPage) {
        errors.push(
          `stopped at the ${this.maxPages}-page limit while Devpost reported ` +
            `${totalCount} matching listings`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error fetching Devpost listings:", error);
      errors.push(message);
    }

    const stats: DevpostDropStats = {
      excludedPastFutureWindow: 0,
      droppedByCountry: 0,
    };
    const hackathons = Array.from(byId.values())
      .map((item) => this.mapEventToHackathon(item, stats))
      .filter((item): item is ParsedHackathon => item !== null);

    const status: ParseStatus =
      errors.length === 0 ? "ok" : pagesFetched > 0 ? "partial" : "failed";
    const dropped = {
      byDateWindow: stats.excludedPastFutureWindow,
      byCountry: stats.droppedByCountry,
    };

    console.log(
      `Devpost: fetched ${byId.size} unique listing(s), matched ` +
        `${hackathons.length} listings, dropped ${dropped.byCountry} ` +
        `non-European and ${dropped.byDateWindow} outside the ` +
        `${MAX_FUTURE_DAYS}-day window`,
    );

    return { hackathons, errors, status, dropped };
  }

  private async fetchPage(page: number): Promise<DevpostApiResponse> {
    const params = new URLSearchParams({
      "status[]": "upcoming",
      order_by: "submission-deadline",
      page: String(page),
      per_page: String(this.perPage),
    });
    params.append("status[]", "open");

    const url = `${this.baseUrl}?${params.toString()}`;
    const response = await fetchWithRetry(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      throw new Error(`Devpost API HTTP ${response.status} for page ${page}`);
    }

    return (await response.json()) as DevpostApiResponse;
  }

  private mapEventToHackathon(
    item: DevpostHackathon,
    stats: DevpostDropStats,
  ): ParsedHackathon | null {
    try {
      if (!item.title || !item.url || !item.submission_period_dates)
        return null;

      const dates = this.parseSubmissionPeriod(item.submission_period_dates);
      const now = new Date();
      if (dates.start < now) return null;
      if (dates.start > getMaxFutureCutoff(now)) {
        stats.excludedPastFutureWindow++;
        return null;
      }

      const location = this.getLocation(item.displayed_location);
      const parsedLocation = this.parseLocation(location);
      if (parsedLocation.nonEuropean) {
        stats.droppedByCountry++;
        return null;
      }

      const isOnline = /\b(online|remote|worldwide|virtual)\b/i.test(location);
      return {
        name: item.title.trim(),
        city: parsedLocation.city,
        country_code: parsedLocation.countryCode,
        location_confidence: parsedLocation.countryCode ? "high" : undefined,
        location_type: isOnline
          ? "online"
          : parsedLocation.city
            ? "physical"
            : "tbd",
        date_start: dates.start,
        date_end: dates.end,
        topics: this.extractTopics(
          item.title,
          undefined,
          this.extractThemeNames(item.themes),
        ),
        url: item.url,
        source: "devpost",
      };
    } catch (error) {
      console.error(`Error mapping Devpost event ${item.title}:`, error);
      return null;
    }
  }

  private parseSubmissionPeriod(value: string): { start: Date; end: Date } {
    const match = value
      .trim()
      .match(
        /^([A-Za-z]{3,9})\s+(\d{1,2})(?:\s*[-–]\s*([A-Za-z]{3,9})?\s*(\d{1,2}))?,?\s+(\d{4})$/,
      );
    if (!match) throw new Error(`Unparseable Devpost date range: ${value}`);

    const startMonth = MONTHS[match[1].slice(0, 3).toLowerCase()];
    const endMonth = MONTHS[(match[3] ?? match[1]).slice(0, 3).toLowerCase()];
    const startDay = Number(match[2]);
    const endDay = Number(match[4] ?? match[2]);
    const endYear = Number(match[5]);
    // The printed year applies to the end date; a range that crosses a
    // calendar-year boundary (e.g. "Dec 30 - Jan 02, 2027") has a start
    // date in the *previous* year, not the printed one.
    const startYear = startMonth > endMonth ? endYear - 1 : endYear;
    const start = new Date(Date.UTC(startYear, startMonth, startDay));
    const end = new Date(Date.UTC(endYear, endMonth, endDay, 23, 59, 59, 999));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error(`Invalid Devpost date range: ${value}`);
    }
    return { start, end };
  }

  private getLocation(value: DevpostHackathon["displayed_location"]): string {
    if (typeof value === "string") return value.trim();
    return value?.location?.trim() ?? "";
  }

  private parseLocation(location: string): {
    city?: string;
    countryCode?: string;
    nonEuropean: boolean;
  } {
    if (!location || /\b(online|remote|worldwide|virtual)\b/i.test(location)) {
      return { nonEuropean: false };
    }
    const parts = location
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const countryPart = parts.at(-1);
    const classification = europeanCountries.classifyCountryCode(countryPart);
    if (classification === "non_european") return { nonEuropean: true };

    const countryCode = europeanCountries.normalizeCountry(countryPart);
    const city = europeanCountries.normalizeCity(
      countryCode ? parts.slice(0, -1).join(", ") : location,
    );
    return { city, countryCode, nonEuropean: false };
  }

  private extractThemeNames(themes: DevpostHackathon["themes"]): string {
    return (themes ?? [])
      .map((theme) => (typeof theme === "string" ? theme : (theme.name ?? "")))
      .filter(Boolean)
      .join(" ");
  }
}
