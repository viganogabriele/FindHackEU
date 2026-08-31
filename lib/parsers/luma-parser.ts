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

interface LumaGeoInfo {
  city?: string;
  country_code?: string;
  city_state?: string;
  region?: string;
}

interface LumaEvent {
  name: string;
  start_at: string;
  end_at: string;
  url: string;
  description?: string;
  geo_address_info?: LumaGeoInfo;
}

interface LumaEventEntry {
  event: LumaEvent;
}

interface LumaApiResponse {
  entries?: LumaEventEntry[];
  has_more?: boolean;
  next_cursor?: string;
}

export class LumaParser extends BaseParser {
  readonly name = "luma";
  readonly enabled = true;

  private readonly slugs = ["tech", "ai", "crypto"];

  // Bounding box originale: invariata.
  private readonly bounds = {
    south: 34.800556,
    north: 81.806667,
    west: -31.275,
    east: 69.033333,
  };

  private readonly apiUrl =
    "https://api.luma.com/discover/get-paginated-events";

  // Luma accetta 50 eventi per richiesta.
  private readonly paginationLimit = 50;

  // Configurabile via env var per bilanciare copertura e rischio
  // di anti-abuse checks lato Luma; default a più di una pagina
  // per superare gli hackathon oltre la posizione 50.
  private readonly maxPagesPerSlug = LumaParser.resolveMaxPagesPerSlug();

  // Piccolo delay tra le richieste di pagine successive per restare
  // ben al di sotto di eventuali rate limit impliciti di Luma.
  private readonly pageDelayMs = 350;

  private static resolveMaxPagesPerSlug(): number {
    const raw = process.env.LUMA_MAX_PAGES_PER_SLUG;
    const parsed = raw ? parseInt(raw, 10) : NaN;

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async discover(): Promise<DiscoverResult> {
    const allHackathons: ParsedHackathon[] = [];
    const errors: string[] = [];

    for (const slug of this.slugs) {
      try {
        const { events, pagesFetched } = await this.fetchEventsForSlug(slug);
        const stats = { excludedPastFutureWindow: 0 };
        const hackathons = this.filterHackathons(events, stats);

        console.log(
          `Luma [${slug}]: fetched ${pagesFetched} page(s), ` +
            `${events.length} raw events, matched ${hackathons.length} hackathons, ` +
            `excluded ${stats.excludedPastFutureWindow} beyond the ` +
            `${MAX_FUTURE_DAYS}-day future window`,
        );

        allHackathons.push(...hackathons);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error(`Error parsing slug ${slug}:`, error);
        errors.push(`[${slug}] ${message}`);
      }
    }

    const hackathons = this.deduplicateHackathons(allHackathons);

    let status: ParseStatus;

    if (errors.length === 0) {
      status = "ok";
    } else if (errors.length >= this.slugs.length) {
      // Every slug we attempted failed: this is a real provider
      // failure, not "zero matching events this run".
      status = "failed";
    } else {
      status = "partial";
    }

    return { hackathons, errors, status };
  }

  private async fetchEventsForSlug(
    slug: string,
  ): Promise<{ events: LumaEventEntry[]; pagesFetched: number }> {
    const allEvents: LumaEventEntry[] = [];
    let cursor: string | null = null;
    let page = 0;

    while (page < this.maxPagesPerSlug) {
      if (page > 0) {
        await this.sleep(this.pageDelayMs);
      }

      const params = new URLSearchParams({
        slug,
        south: this.bounds.south.toString(),
        north: this.bounds.north.toString(),
        west: this.bounds.west.toString(),
        east: this.bounds.east.toString(),
        pagination_limit: this.paginationLimit.toString(),
      });

      if (cursor) {
        params.set("pagination_cursor", cursor);
      }

      const url = `${this.apiUrl}?${params.toString()}`;

      page++;

      const response = await fetch(url, {
        headers: {
          Accept: "*/*",
          "User-Agent": "Mozilla/5.0",
          "x-luma-client-type": "luma-web",
          "x-luma-timezone": "Europe/Rome",
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");

        throw new Error(
          `Luma API HTTP ${response.status} for slug "${slug}"${
            body ? `: ${body}` : ""
          }`,
        );
      }

      const data: LumaApiResponse = await response.json();
      const events = Array.isArray(data.entries) ? data.entries : [];

      allEvents.push(...events);

      console.log(
        `Luma [${slug}]: fetched page ${page} with ${events.length} events`,
      );

      if (!data.has_more || !data.next_cursor || page >= this.maxPagesPerSlug) {
        break;
      }

      cursor = data.next_cursor;
    }

    return { events: allEvents, pagesFetched: page };
  }

  /**
   * Hackathon classification is delegated to the shared, multilingual,
   * score-based classifier in `lib/classification/hackathon-classifier.ts`
   * (see issue #7). Every decision — accepted, rejected, or borderline —
   * is logged with its score and reason so classification quality can be
   * audited and tuned later against real data (issue #38).
   */
  private filterHackathons(
    events: LumaEventEntry[],
    stats: { excludedPastFutureWindow: number },
  ): ParsedHackathon[] {
    const hackathons = events
      .filter((entry) => this.isHackathon(entry.event))
      .map((entry) => this.mapEventToHackathon(entry, stats))
      .filter((hackathon): hackathon is ParsedHackathon => hackathon !== null);

    // Observability for issue #5 / #31: this doesn't drop anything (a
    // hackathon with a city but no resolved country still gets a shot at
    // geocoding in LocationEnhancementService), but it makes visible how
    // often Luma's own metadata leaves the country undetermined, which is
    // the gap this issue targets.
    const undeterminedWithCity = hackathons.filter(
      (h) => h.city && !h.country_code,
    ).length;

    if (undeterminedWithCity > 0) {
      console.log(
        `Luma: ${undeterminedWithCity} hackathon(s) have a city but no country_code yet ` +
          `(pending geocoding in LocationEnhancementService).`,
      );
    }

    return hackathons;
  }

  private isHackathon(event: LumaEvent): boolean {
    const title = event?.name || "";

    if (!this.normalizeSearchText(title)) {
      return false;
    }

    const result = classifyHackathon(title, event?.description || "");

    if (result.decision === "borderline") {
      console.warn(
        `Luma classifier BORDERLINE (score ${result.score}) for "${title}": ${result.reason}`,
      );
    } else {
      console.log(
        `Luma classifier ${result.decision.toUpperCase()} (score ${result.score}) for "${title}": ${result.reason}`,
      );
    }

    return result.isHackathon;
  }

  private normalizeSearchText(value: string): string {
    return value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/[’']/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  private mapEventToHackathon(
    entry: LumaEventEntry,
    stats: { excludedPastFutureWindow: number },
  ): ParsedHackathon | null {
    try {
      const event = entry.event;

      if (!event?.name || !event?.start_at || !event?.url) {
        return null;
      }

      const geo = event.geo_address_info || {};
      const dates = this.formatDate(event.start_at, event.end_at);

      // Filtra solo eventi futuri.
      const now = new Date();

      if (dates.start < now) {
        return null;
      }

      // Scarta eventi oltre la finestra di ricerca futura configurata
      // (vedi lib/config/discovery-config.ts). Senza questo limite,
      // l'orizzonte di ricerca dipende solo dall'ordinamento interno di
      // Luma, che non è né configurabile né documentato.
      if (dates.start > getMaxFutureCutoff(now)) {
        stats.excludedPastFutureWindow++;
        return null;
      }

      let city = europeanCountries.normalizeCity(geo.city);

      let country_code = europeanCountries.normalizeCountry(geo.country_code);

      // Fallback per dati incompleti.
      if (!city && geo.city_state) {
        const parts = geo.city_state.split(",").map((part) => part.trim());

        if (parts.length >= 1) {
          city = europeanCountries.normalizeCity(parts[0]);
        }
      }

      if (!country_code) {
        country_code = europeanCountries.normalizeCountry(geo.region);

        if (!country_code && geo.city_state) {
          const parts = geo.city_state.split(",").map((part) => part.trim());

          if (parts.length >= 2) {
            country_code = europeanCountries.normalizeCountry(
              parts[parts.length - 1],
            );
          }
        }
      }

      // Se il paese è determinato ma non europeo, scarta. Nota: dato che
      // normalizeCountry() restituisce solo codici europei conosciuti (o
      // undefined), questo ramo copre solo il caso di un country_code già
      // normalizzato che risultasse comunque non valido; è tenuto come
      // difesa in profondità.
      if (
        country_code &&
        !europeanCountries.isValidEuropeanCountry(country_code)
      ) {
        console.log(
          `Dropping Luma event "${event.name}": explicit country_code ${country_code} is not European.`,
        );
        return null;
      }

      // Se il country_code arriva direttamente dai dati strutturati della
      // fonte (country_code, region o la parte finale di city_state), è
      // "high confidence". Se non è ancora determinato ma abbiamo una
      // città, proviamo un'inferenza euristica gratuita da nomi di città
      // noti (con supporto multilingua/diacritici, vedi
      // lib/european-countries.ts) prima di lasciare il completamento al
      // geocoding a pagamento in LocationEnhancementService (issue #5).
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
        name: event.name.replace(/\|/g, "-"),
        city,
        country_code,
        location_confidence,
        date_start: dates.start,
        date_end: dates.end,
        topics: this.extractTopics(event.name, event.description),
        url: `https://luma.com/${event.url}`,
        source: "luma",
      };
    } catch (error) {
      console.error("Error mapping Luma event:", error);
      return null;
    }
  }

  private deduplicateHackathons(
    hackathons: ParsedHackathon[],
  ): ParsedHackathon[] {
    const seen = new Set<string>();

    return hackathons.filter((hackathon) => {
      const key = `${hackathon.name}-${hackathon.date_start.toISOString()}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }
}
