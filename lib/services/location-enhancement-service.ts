import { GeocodingService } from "./geocoding-service";
import { europeanCountries } from "@/lib/european-countries";
import type { ParsedHackathon } from "@/lib/parsers/base-parser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/services/fetch-all-rows";
import { normalizeUrl } from "@/lib/dedup/url-normalizer";
import pLimit from "p-limit";
import {
  getCachedCoordinates,
  setCachedCoordinates,
} from "@/lib/services/geocode-cache";

/**
 * Servizio per migliorare i dati di location degli hackathon
 * usando il geocoding quando necessario
 */
export class LocationEnhancementService {
  /**
   * Applica il geocoding a nuovi hackathon che hanno una città ma non le
   * coordinate; il country code può essere già fornito dalla fonte.
   * @param hackathons Lista di hackathon parsed
   * @param existingUrls URLs già presenti nel database per evitare geocoding inutile
   * @returns Lista di hackathon con location enhanced
   */
  static async enhanceLocations(
    hackathons: ParsedHackathon[],
    existingUrls: Set<string>,
  ): Promise<ParsedHackathon[]> {
    console.log(
      `Starting location enhancement for ${hackathons.length} hackathons...`,
    );

    // Limit concurrent geocoding requests to avoid API rate limits
    const limit = pLimit(3);

    // Counters for observability (issue #5 / feeds issue #31): every event
    // dropped for a non-European country, or kept with an undetermined
    // country, is logged and counted here instead of silently
    // disappearing from (or being dropped by) the pipeline.
    let droppedNonEuropean = 0;
    let undeterminedCountryCount = 0;
    let geocodingUnavailableCount = 0;

    // Process hackathons in parallel with concurrency limit
    const enhancedResults = await Promise.all(
      hackathons.map((hackathon) =>
        limit(async () => {
          // Applica geocoding solo se:
          // 1. L'hackathon non esiste già nel database (URL non presente,
          //    confrontato in forma normalizzata - vedi
          //    lib/dedup/url-normalizer.ts - così un alias come lu.ma vs
          //    luma.com non sembra "nuovo" solo per una differenza
          //    cosmetica nell'URL, trovato in code review)
          // 2. Has a city but is missing coordinates. Coordinates are now
          // needed by the public radius filter (issue #109); even a source
          // that already supplied a country code may still need geocoding.
          const shouldGeocode = Boolean(
            !existingUrls.has(normalizeUrl(hackathon.url)) &&
            hackathon.city &&
            (hackathon.latitude === undefined ||
              hackathon.longitude === undefined),
          );

          if (!shouldGeocode) {
            // Non serve geocoding, include l'hackathon così com'è
            return hackathon;
          }

          const city = hackathon.city!;

          // Keep the known-city lookup as a fallback for country resolution
          // when the paid geocoder is unavailable. It cannot provide
          // coordinates, so it must not short-circuit the API request.
          const inferredCountry = europeanCountries.inferCountryFromCity(city);

          if (inferredCountry) {
            console.log(
              `Known city map suggests ${city} -> ${inferredCountry}`,
            );
          }

          try {
            const geocodingAddress = hackathon.country_code
              ? `${city}, ${europeanCountries.getCountryName(hackathon.country_code) ?? hackathon.country_code}`
              : city;
            const cached = await getCachedCoordinates(geocodingAddress);
            const outcome = cached
              ? cached.countryCode &&
                europeanCountries.classifyCountryCode(cached.countryCode) ===
                  "non_european"
                ? {
                    status: "non_european" as const,
                    countryCode: cached.countryCode,
                    latitude: cached.latitude,
                    longitude: cached.longitude,
                  }
                : {
                    status: "found" as const,
                    countryCode:
                      cached.countryCode ?? hackathon.country_code ?? "",
                    latitude: cached.latitude,
                    longitude: cached.longitude,
                  }
              : await GeocodingService.getCoordinatesFromAddress(
                  geocodingAddress,
                );

            if (
              !cached &&
              (outcome.status === "found" ||
                outcome.status === "non_european") &&
              outcome.latitude !== undefined &&
              outcome.longitude !== undefined
            ) {
              await setCachedCoordinates(geocodingAddress, {
                latitude: outcome.latitude,
                longitude: outcome.longitude,
                countryCode: outcome.countryCode,
              });
            }

            switch (outcome.status) {
              case "found": {
                console.log(
                  `Enhanced location via geocoding: ${city} -> ${outcome.countryCode}`,
                );
                return {
                  ...hackathon,
                  country_code: hackathon.country_code ?? outcome.countryCode,
                  ...(outcome.latitude !== undefined &&
                  outcome.longitude !== undefined
                    ? {
                        latitude: outcome.latitude,
                        longitude: outcome.longitude,
                      }
                    : {}),
                  ...(hackathon.country_code
                    ? {}
                    : { location_confidence: "low" as const }),
                };
              }

              case "non_european": {
                // A source-provided country is higher confidence than a
                // city-only geocoder result. Preserve the event rather than
                // dropping it because an ambiguous city name was resolved
                // elsewhere, but do not persist coordinates from that
                // conflicting result.
                if (hackathon.country_code) {
                  return hackathon;
                }

                console.log(
                  `Dropping hackathon "${hackathon.name}": city "${city}" geocoded to non-European country ${outcome.countryCode}.`,
                );
                droppedNonEuropean++;
                return null;
              }

              case "not_found": {
                // Geocoding was queried successfully but returned no
                // usable country. This is NOT the same as "confirmed
                // non-European" - we must not delete a legitimate event
                // just because the geocoder didn't recognize an obscure
                // or ambiguous European city. Keep it, unresolved.
                console.log(
                  `Country could not be determined for city "${city}" (hackathon "${hackathon.name}"), keeping with undetermined country.`,
                );
                undeterminedCountryCount++;
                return inferredCountry
                  ? {
                      ...hackathon,
                      country_code: inferredCountry,
                      location_confidence: "low" as const,
                    }
                  : hackathon;
              }

              case "unavailable":
              default: {
                // Geocoding could not even be attempted (no API key,
                // network error, malformed response). This is NOT the
                // same as "country not determined" - we must not drop
                // the event just because our own infrastructure/quota
                // failed. Keep it, unresolved, for a future run.
                console.log(
                  `Geocoding unavailable for "${city}" (hackathon "${hackathon.name}"), keeping with undetermined country.`,
                );
                geocodingUnavailableCount++;
                return inferredCountry
                  ? {
                      ...hackathon,
                      country_code: inferredCountry,
                      location_confidence: "low" as const,
                    }
                  : hackathon;
              }
            }
          } catch (error) {
            console.error(`Error enhancing location for ${city}:`, error);
            // Include hackathon anyway in case of unexpected errors -
            // never drop an event because our own code threw.
            return hackathon;
          }
        }),
      ),
    );

    // Filter out null results (dropped hackathons)
    const validHackathons = enhancedResults.filter(
      (h) => h !== null,
    ) as ParsedHackathon[];

    console.log(
      `Location enhancement completed: ${validHackathons.length}/${hackathons.length} hackathons kept ` +
        `(dropped ${droppedNonEuropean} non-European; ${undeterminedCountryCount} kept with undetermined country ` +
        `because geocoding found no usable result; ${geocodingUnavailableCount} kept unresolved because ` +
        `geocoding was unavailable)`,
    );

    return validHackathons;
  }

  /**
   * Ottiene tutti gli URL esistenti nel database per evitare geocoding inutile
   */
  static async getExistingUrls(
    supabaseClient: SupabaseClient,
  ): Promise<Set<string>> {
    try {
      // Paginated (see lib/services/fetch-all-rows.ts) - a plain
      // .select("url") silently truncates once the table exceeds
      // PostgREST's max_rows, which would make already-known hackathons
      // invisible here and trigger redundant/wasted geocoding calls.
      // Ordered by `id` so concurrent inserts during pagination can't
      // shift row positions between pages and cause a row to be skipped
      // or read twice (found in code review).
      const existing = await fetchAllRows<{ url: string }>((from, to) =>
        supabaseClient
          .from("hackathons")
          .select("url")
          .order("id", { ascending: true })
          .range(from, to),
      );

      // Normalized (see lib/dedup/url-normalizer.ts), not raw - callers
      // compare against a freshly-parsed hackathon's URL, which may be a
      // cosmetically different but equivalent alias (lu.ma vs luma.com,
      // tracking params, trailing slash) of what's already stored. Without
      // this, an already-known event under an aliased URL would still
      // trigger a redundant/wasted geocoding call (found in code review).
      return new Set(existing.map((h) => normalizeUrl(h.url)));
    } catch (error) {
      console.error("Error fetching existing URLs:", error);
      return new Set();
    }
  }
}
