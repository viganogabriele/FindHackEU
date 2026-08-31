import { GeocodingService } from "./geocoding-service";
import { europeanCountries } from "@/lib/european-countries";
import type { ParsedHackathon } from "@/lib/parsers/base-parser";
import type { SupabaseClient } from "@supabase/supabase-js";
import pLimit from "p-limit";

/**
 * Servizio per migliorare i dati di location degli hackathon
 * usando il geocoding quando necessario
 */
export class LocationEnhancementService {
  /**
   * Applica il geocoding a hackathon che hanno città ma non country code
   * Solo se l'hackathon sarà effettivamente inserito nel database
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
    // dropped for an undetermined or non-European country is logged and
    // counted here, instead of silently disappearing from the pipeline.
    let droppedNonEuropean = 0;
    let droppedUndeterminedCountry = 0;
    let geocodingUnavailableCount = 0;

    // Process hackathons in parallel with concurrency limit
    const enhancedResults = await Promise.all(
      hackathons.map((hackathon) =>
        limit(async () => {
          // Applica geocoding solo se:
          // 1. L'hackathon non esiste già nel database (URL non presente)
          // 2. Ha una città ma non un country code
          const shouldGeocode = Boolean(
            !existingUrls.has(hackathon.url) &&
              hackathon.city &&
              !hackathon.country_code,
          );

          if (!shouldGeocode) {
            // Non serve geocoding, include l'hackathon così com'è
            return hackathon;
          }

          const city = hackathon.city!;

          // Cheap, free-of-cost pass first: a known-city lookup (with
          // multilingual/diacritic normalization, see
          // lib/european-countries.ts) resolves common cases like
          // "Zurich"/"Zürich"/"Zurigo" -> CH without ever hitting the
          // paid geocoding API. This is the "apply geocoding more
          // systematically, but not more expensively" part of issue #5.
          const inferredCountry = europeanCountries.inferCountryFromCity(city);

          if (inferredCountry) {
            console.log(
              `Enhanced location from known-city map: ${city} -> ${inferredCountry}`,
            );
            return {
              ...hackathon,
              country_code: inferredCountry,
              location_confidence: "low" as const,
            };
          }

          try {
            const outcome = await GeocodingService.getCountryCodeFromCity(
              city,
            );

            switch (outcome.status) {
              case "found": {
                console.log(
                  `Enhanced location via geocoding: ${city} -> ${outcome.countryCode}`,
                );
                return {
                  ...hackathon,
                  country_code: outcome.countryCode,
                  location_confidence: "low" as const,
                };
              }

              case "non_european": {
                console.log(
                  `Dropping hackathon "${hackathon.name}": city "${city}" geocoded to non-European country ${outcome.countryCode}.`,
                );
                droppedNonEuropean++;
                return null;
              }

              case "not_found": {
                console.log(
                  `Dropping hackathon "${hackathon.name}": country could not be determined for city "${city}" (geocoding queried, no usable result).`,
                );
                droppedUndeterminedCountry++;
                return null;
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
                return hackathon;
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
        `(dropped ${droppedNonEuropean} non-European, ${droppedUndeterminedCountry} with undetermined country; ` +
        `${geocodingUnavailableCount} kept unresolved because geocoding was unavailable)`,
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
      const { data: existing, error } = await supabaseClient
        .from("hackathons")
        .select("url");

      if (error) {
        console.error("Error fetching existing URLs:", error);
        return new Set();
      }

      return new Set(existing?.map((h: { url: string }) => h.url) || []);
    } catch (error) {
      console.error("Error fetching existing URLs:", error);
      return new Set();
    }
  }
}
