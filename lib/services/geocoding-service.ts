import { europeanCountries } from "@/lib/european-countries";

interface GeocodingResponse {
  success: boolean;
  message: string;
  error: string | null;
  element: {
    providedBy: string;
    latitude: number;
    longitude: number;
    bounds: {
      south: number;
      west: number;
      north: number;
      east: number;
    };
    streetNumber: string | null;
    streetName: string | null;
    postalCode: string;
    locality: string;
    subLocality: string | null;
    adminLevels: {
      [key: string]: {
        name: string;
        code: string | null;
        level: number;
      };
    };
    country: string;
    countryCode: string;
    timezone: string | null;
    id: string;
  };
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
  static async getCountryCodeFromCity(
    city: string,
  ): Promise<GeocodingOutcome> {
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

      const response = await fetch(this.API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ address }),
      });

      if (!response.ok) {
        console.error(`Authentication failed for city: ${city}`);
        return { status: "unavailable" };
      }

      const data: GeocodingResponse = await response.json();

      // Controlla la struttura della risposta
      if (!data || !data.element) {
        console.warn(`Invalid geocoding response structure for city: ${city}`);
        return { status: "unavailable" };
      }

      const countryCode = data.element.countryCode;

      if (!countryCode) {
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
        // undefined), so an unrecognized code here means either a
        // non-European country or a code our alias list doesn't cover.
        // Never guess: treat as "not determined" rather than fabricating
        // a country.
        console.warn(
          `Could not normalize country code ${countryCode} for city: ${city}`,
        );
        return { status: "not_found" };
      }

      // Verifica che sia un paese europeo
      if (!europeanCountries.isValidEuropeanCountry(normalizedCountryCode)) {
        console.log(
          `City ${city} is not in Europe (${normalizedCountryCode}). Filtering out.`,
        );
        return { status: "non_european", countryCode: normalizedCountryCode };
      }

      console.log(`Geocoding success: ${city} -> ${normalizedCountryCode}`);

      return { status: "found", countryCode: normalizedCountryCode };
    } catch (error) {
      console.error(`Error geocoding city ${city}:`, error);
      return { status: "unavailable" };
    }
  }
}
