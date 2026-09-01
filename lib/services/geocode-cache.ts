import { supabaseAdmin } from "@/lib/supabase";

export interface CachedCoordinates {
  latitude: number;
  longitude: number;
  countryCode: string | null;
}

interface GeocodeCacheRow {
  query: string;
  latitude: number;
  longitude: number;
  country_code: string | null;
}

export function normalizeGeocodeQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export async function getCachedCoordinates(
  query: string,
): Promise<CachedCoordinates | null> {
  const normalizedQuery = normalizeGeocodeQuery(query);
  if (!normalizedQuery) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("geocode_cache")
      .select("latitude, longitude, country_code")
      .eq("query", normalizedQuery)
      .maybeSingle();

    if (error) {
      console.error("Error reading geocode cache:", error);
      return null;
    }

    const row = data as GeocodeCacheRow | null;
    return row
      ? {
          latitude: row.latitude,
          longitude: row.longitude,
          countryCode: row.country_code,
        }
      : null;
  } catch (error) {
    console.error("Error reading geocode cache:", error);
    return null;
  }
}

export async function setCachedCoordinates(
  query: string,
  coordinates: CachedCoordinates,
): Promise<void> {
  const normalizedQuery = normalizeGeocodeQuery(query);
  if (!normalizedQuery) return;

  try {
    const { error } = await supabaseAdmin.from("geocode_cache").upsert(
      {
        query: normalizedQuery,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        country_code: coordinates.countryCode,
      } as never,
      { onConflict: "query" },
    );

    if (error) console.error("Error writing geocode cache:", error);
  } catch (error) {
    console.error("Error writing geocode cache:", error);
  }
}
