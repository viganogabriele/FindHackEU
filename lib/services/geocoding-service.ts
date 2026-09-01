import { europeanCountries } from "@/lib/european-countries";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

interface GeocodingResponse {
  element: {
    countryCode?: unknown;
  };
}

const GEOCODING_TIMEOUT_MS = 5_000;
const GEOCODING_RETRIES = 2;
const GEOCODING_BACKOFF_MS = 250;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate the part of the provider response consumed by this service.
 * Fields unrelated to country resolution are intentionally not required:
 * the API may add or omit provider metadata without changing this contract.
 */
function isGeocodingResponse(value: unknown): value is GeocodingResponse {
  if (!isRecord(value) || !isRecord(value.element)) {
    return false;
  }

  const countryCode = value.element.countryCode;

  return (
    countryCode === undefined ||
    countryCode === null ||
    typeof countryCode === "string"
  );
}

/**
 * Outcome of a geocoding lookup, distinguishing "we asked and got a
 * definitive answer" from "we couldn't even ask" (issue #5). This
 * distinction matters downstream: a missing API key or a transient error
 * should never be treated the same as "we geocoded this and there is no
 * European country here" - the former must not cause an event to be
 * dropped, only the latter (and even then, only logged/counted, never
 * silently swallowed).
 */
export type GeocodingOutcome =
  | { status: "found"; countryCode: string }
  | { status: "not_found" }
  | { status: "non_european"; countryCode: string }
  | { status: "unavailable" };

export class GeocodingService {
  private static readonly API_URL = "https://geocoding.openapi.it/geocode";

  /**
   * Ottiene il country code da una città usando l'API di geocoding
   * @param city Nome della città
   * @returns un `GeocodingOutcome` che distingue "trovato", "non trovato",
   * "trovato ma non europeo" e "geocoding non disponibile" (nessuna API
   * key, errore di rete, risposta malformata)
   */
  static async getCountryCodeFromCity(city: string): Promise<GeocodingOutcome> {
    try {
      const apiKey = process.env.OPENAPI_GEOCODING_KEY;
      if (!apiKey) {
        console.warn(
          "OPENAPI_GEOCODING_KEY not configured. Skipping geocoding.",
        );
        return { status: "unavailable" };
      }

      console.log(`Geocoding API request for: ${city}`);

      const address = city.trim();

      const response = await fetchWithRetry(
        this.API_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ address }),
        },
        {
          timeoutMs: GEOCODING_TIMEOUT_MS,
          retries: GEOCODING_RETRIES,
          backoffMs: GEOCODING_BACKOFF_MS,
        },
      );

      if (!response.ok) {
        console.error(
          `Geocoding API returned HTTP ${response.status} for city: ${city}`,
        );
        return { status: "unavailable" };
      }

      const data: unknown = await response.json();

      if (!isGeocodingResponse(data)) {
        console.warn(`Invalid geocoding response structure for city: ${city}`);
        return { status: "unavailable" };
      }

      const countryCode = data.element.countryCode;

      if (typeof countryCode !== "string" || !countryCode.trim()) {
        console.warn(
          `No country code found in geocoding response for city: ${city}`,
        );
        return { status: "not_found" };
      }

      // Normalizza il country code usando il nostro sistema
      const normalizedCountryCode =
        europeanCountries.normalizeCountry(countryCode);

      if (!normalizedCountryCode) {
        // normalizeCountry() only ever returns European codes (or
        // undefined), so this branch alone can't tell "US"/"JP" (a real,
        // well-formed, but non-European code) apart from actual garbage.
        // Use classifyCountryCode() for that distinction instead of
        // collapsing both into "not determined" (found in code review -
        // this previously made the non_european status effectively
        // unreachable from this path).
        const classification =
          europeanCountries.classifyCountryCode(countryCode);

        if (classification === "non_european") {
          console.log(
            `City ${city} geocoded to non-European country ${countryCode}. Filtering out.`,
          );
          return {
            status: "non_european",
            countryCode: countryCode.trim().toUpperCase(),
          };
        }

        console.warn(
          `Could not normalize country code ${countryCode} for city: ${city}`,
        );
        return { status: "not_found" };
      }

      console.log(`Geocoding success: ${city} -> ${normalizedCountryCode}`);

      return { status: "found", countryCode: normalizedCountryCode };
    } catch (error) {
      console.error(`Error geocoding city ${city}:`, error);
      return { status: "unavailable" };
    }
  }
}
