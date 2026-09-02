import { getCityCentroid } from "@/lib/city-centroids";
import { europeanCountries } from "@/lib/european-countries";

export interface CountryCentroid {
  latitude: number;
  longitude: number;
}

/**
 * Approximate country-centre coordinates used when an event has no geocoded
 * city. They are deliberately static: the map fallback must not make a
 * network request or pretend that a country-level position is exact.
 */
export const COUNTRY_CENTROIDS: Readonly<Record<string, CountryCentroid>> = {
  AD: { latitude: 42.5063, longitude: 1.5218 },
  AL: { latitude: 41.1533, longitude: 20.1683 },
  AT: { latitude: 47.5162, longitude: 14.5501 },
  BA: { latitude: 43.9159, longitude: 17.6791 },
  BE: { latitude: 50.5039, longitude: 4.4699 },
  BG: { latitude: 42.7339, longitude: 25.4858 },
  BY: { latitude: 53.7098, longitude: 27.9534 },
  CH: { latitude: 46.8182, longitude: 8.2275 },
  CY: { latitude: 35.1264, longitude: 33.4299 },
  CZ: { latitude: 49.8175, longitude: 15.473 },
  DE: { latitude: 51.1657, longitude: 10.4515 },
  DK: { latitude: 56.2639, longitude: 9.5018 },
  EE: { latitude: 58.5953, longitude: 25.0136 },
  ES: { latitude: 40.4637, longitude: -3.7492 },
  FI: { latitude: 61.9241, longitude: 25.7482 },
  FR: { latitude: 46.2276, longitude: 2.2137 },
  GB: { latitude: 55.3781, longitude: -3.436 },
  GR: { latitude: 39.0742, longitude: 21.8243 },
  HR: { latitude: 45.1, longitude: 15.2 },
  HU: { latitude: 47.1625, longitude: 19.5033 },
  IE: { latitude: 53.1424, longitude: -7.6921 },
  IS: { latitude: 64.9631, longitude: -19.0208 },
  IT: { latitude: 41.8719, longitude: 12.5674 },
  LI: { latitude: 47.166, longitude: 9.5554 },
  LT: { latitude: 55.1694, longitude: 23.8813 },
  LU: { latitude: 49.8153, longitude: 6.1296 },
  LV: { latitude: 56.8796, longitude: 24.6032 },
  MC: { latitude: 43.7384, longitude: 7.4246 },
  MD: { latitude: 47.4116, longitude: 28.3699 },
  ME: { latitude: 42.7087, longitude: 19.3744 },
  MK: { latitude: 41.6086, longitude: 21.7453 },
  MT: { latitude: 35.9375, longitude: 14.3754 },
  NL: { latitude: 52.1326, longitude: 5.2913 },
  NO: { latitude: 60.472, longitude: 8.4689 },
  PL: { latitude: 51.9194, longitude: 19.1451 },
  PT: { latitude: 39.3999, longitude: -8.2245 },
  RO: { latitude: 45.9432, longitude: 24.9668 },
  RS: { latitude: 44.0165, longitude: 21.0059 },
  SE: { latitude: 60.1282, longitude: 18.6435 },
  SI: { latitude: 46.1512, longitude: 14.9955 },
  SK: { latitude: 48.669, longitude: 19.699 },
  SM: { latitude: 43.9424, longitude: 12.4578 },
  TR: { latitude: 38.9637, longitude: 35.2433 },
  UA: { latitude: 48.3794, longitude: 31.1656 },
  VA: { latitude: 41.9029, longitude: 12.4534 },
  XK: { latitude: 42.6026, longitude: 20.903 },
};

export function getCountryCentroid(
  countryCode: string | null | undefined,
): CountryCentroid | undefined {
  const normalizedCode = countryCode?.trim().toUpperCase();
  if (
    !normalizedCode ||
    !europeanCountries.isValidEuropeanCountry(normalizedCode)
  ) {
    return undefined;
  }

  return COUNTRY_CENTROIDS[normalizedCode];
}

export interface MapCoordinateInput {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  countryCode: string | null | undefined;
  city?: string | null | undefined;
}

export interface ResolvedMapCoordinates extends CountryCentroid {
  approximate: boolean;
}

function isFiniteCoordinate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function resolveMapCoordinates(
  input: MapCoordinateInput,
): ResolvedMapCoordinates | undefined {
  if (
    isFiniteCoordinate(input.latitude) &&
    isFiniteCoordinate(input.longitude)
  ) {
    return {
      latitude: input.latitude,
      longitude: input.longitude,
      approximate: false,
    };
  }

  const cityCentroid = getCityCentroid(input.city);
  if (cityCentroid) {
    return { ...cityCentroid, approximate: true };
  }

  const centroid = getCountryCentroid(input.countryCode);
  return centroid ? { ...centroid, approximate: true } : undefined;
}
