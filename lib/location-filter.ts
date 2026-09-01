/**
 * Country-wide location filtering (issue #73).
 *
 * `contexts/filter-context.tsx`'s `locations: string[]` filter previously
 * only ever stored exact `"City, Country"` strings produced by
 * `europeanCountries.formatLocation()` - there was no way to select "all
 * of Italy" as a single unit, which became impractical once Eventbrite
 * started surfacing 10+ distinct cities per country in one run.
 *
 * This adds a second kind of entry to that same flat `locations` array: a
 * country-wide marker, distinguished from a real "City, Country" string by
 * a `country:` prefix that can never collide with `formatLocation()`'s
 * output (which always starts with a city name or a bare country name,
 * never this literal prefix). Chosen over a two-level picker (issue's
 * option (b)) as the less invasive UI change - see the issue for the two
 * sketched options.
 */
import { europeanCountries } from "@/lib/european-countries";

export interface RadiusFilter {
  query: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export const DEFAULT_RADIUS_KM = 25;

const EARTH_RADIUS_KM = 6371;

function isValidLatitude(value: number | null | undefined): value is number {
  return (
    value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(value: number | null | undefined): value is number {
  return (
    value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

/** Calculate the great-circle distance between two WGS84 points. */
export function calculateDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const latitudeARadians = toRadians(latitudeA);
  const latitudeBRadians = toRadians(latitudeB);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeARadians) *
      Math.cos(latitudeBRadians) *
      Math.sin(deltaLongitude / 2) ** 2;

  // Clamp against tiny floating-point drift for antipodal points.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

/** Whether a hackathon's persisted coordinates fall within an active radius. */
export function hackathonMatchesRadiusFilter(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  radius: RadiusFilter | null,
): boolean {
  if (radius === null) {
    return true;
  }

  if (
    !isValidLatitude(latitude) ||
    !isValidLongitude(longitude) ||
    !isValidLatitude(radius.latitude) ||
    !isValidLongitude(radius.longitude) ||
    !Number.isFinite(radius.radiusKm) ||
    radius.radiusKm < 0
  ) {
    return false;
  }

  return (
    calculateDistanceKm(
      radius.latitude,
      radius.longitude,
      latitude,
      longitude,
    ) <= radius.radiusKm
  );
}

const COUNTRY_LOCATION_PREFIX = "country:";

/** Build the filter-array value representing "any city in this country". */
export function toCountryLocationValue(countryCode: string): string {
  return `${COUNTRY_LOCATION_PREFIX}${countryCode}`;
}

/** Whether a `locations` filter entry is a country-wide marker (vs a plain city string). */
export function isCountryLocationValue(value: string): boolean {
  return value.startsWith(COUNTRY_LOCATION_PREFIX);
}

/** Extract the country code back out of a country-wide marker, or undefined if it isn't one. */
export function countryCodeFromLocationValue(
  value: string,
): string | undefined {
  return isCountryLocationValue(value)
    ? value.slice(COUNTRY_LOCATION_PREFIX.length)
    : undefined;
}

/**
 * Human-readable label for a country-wide filter option, e.g.
 * "🇮🇹 All of Italy". Used by the sidebar combobox/badges - the raw
 * `country:IT` value is never shown to the user.
 */
export function formatCountryLocationLabel(
  countryCode: string,
  allOfLabel: (country: string) => string,
): string {
  const name = europeanCountries.getCountryName(countryCode) ?? countryCode;
  const emoji = europeanCountries.getCountryEmoji(countryCode);
  return `${emoji} ${allOfLabel(name)}`;
}

/**
 * Resolve any `locations` filter entry (country-wide marker or plain
 * "City, Country" string) to a display label. Falls back to returning the
 * value unchanged for a plain city string, so callers can use this
 * uniformly over the whole `locations` array.
 */
export function formatLocationValueLabel(
  value: string,
  allOfLabel: (country: string) => string,
): string {
  const countryCode = countryCodeFromLocationValue(value);
  return countryCode
    ? formatCountryLocationLabel(countryCode, allOfLabel)
    : value;
}

/**
 * Get the city-level options for a country-wide marker from the combined
 * option list. `buildLocationOptions()` formats city entries with the
 * canonical country name, so matching the suffix keeps this helper independent
 * of the raw hackathon rows used to build the list.
 */
export function getCityLocationOptionsForCountry(
  locationOptions: string[],
  countryCode: string,
): string[] {
  const countryName =
    europeanCountries.getCountryName(countryCode) ?? countryCode;
  const countrySuffix = `, ${countryName}`;

  return locationOptions.filter(
    (location) =>
      !isCountryLocationValue(location) && location.endsWith(countrySuffix),
  );
}

/**
 * Whether a hackathon matches the selected `locations` filter, honoring
 * both country-wide markers (matches any city in that country) and plain
 * city-level exact matches (existing behavior, preserved as-is).
 *
 * An empty `selectedLocations` array means "no location filter applied" -
 * matches everything, same as before this feature existed.
 */
export function hackathonMatchesLocationFilter(
  city: string | null | undefined,
  countryCode: string | null | undefined,
  selectedLocations: string[],
): boolean {
  if (selectedLocations.length === 0) {
    return true;
  }

  const matchesCountryWide = selectedLocations.some((loc) => {
    const code = countryCodeFromLocationValue(loc);
    return code !== undefined && Boolean(countryCode) && code === countryCode;
  });
  if (matchesCountryWide) {
    return true;
  }

  const hackathonLocation = europeanCountries.formatLocation(city, countryCode);
  return (
    Boolean(hackathonLocation) &&
    selectedLocations.includes(hackathonLocation as string)
  );
}

/**
 * Build the combined location-filter option list for a set of hackathons:
 * one country-wide entry per distinct country present, followed by every
 * distinct "City, Country" combination - mirrors the flat single-list UI
 * (issue's option (a)).
 */
export function buildLocationOptions(
  hackathons: Array<{
    city?: string | null;
    country_code?: string | null;
  }>,
): string[] {
  const countryCodes = new Set<string>();
  const cityLocations = new Set<string>();

  for (const h of hackathons) {
    if (h.country_code) {
      countryCodes.add(h.country_code);
    }
    const formatted = europeanCountries.formatLocation(h.city, h.country_code);
    if (formatted) {
      cityLocations.add(formatted);
    }
  }

  const countryOptions = Array.from(countryCodes)
    .sort((a, b) => {
      const nameA = europeanCountries.getCountryName(a) ?? a;
      const nameB = europeanCountries.getCountryName(b) ?? b;
      return nameA.localeCompare(nameB);
    })
    .map((code) => toCountryLocationValue(code));

  return [...countryOptions, ...Array.from(cityLocations).sort()];
}
