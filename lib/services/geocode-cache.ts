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

const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ROWS = 10_000;

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
        // @ts-expect-error - Supabase generated types do not accept this cache row shape
        query: normalizedQuery,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        country_code: coordinates.countryCode,
      },
      { onConflict: "query" },
    );

    if (error) console.error("Error writing geocode cache:", error);
  } catch (error) {
    console.error("Error writing geocode cache:", error);
  }
}

/**
 * Best-effort maintenance for the public, unauthenticated lookup API.
 * Expired entries are removed first; if arbitrary queries still push the
 * table above the cap, the oldest rows are evicted.
 */
export async function pruneGeocodeCache(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const { error: expiredError } = await supabaseAdmin
      .from("geocode_cache")
      .delete()
      .lt("created_at", cutoff);

    if (expiredError) {
      console.error(
        "Error removing expired geocode cache entries:",
        expiredError,
      );
      return;
    }

    const { count, error: countError } = await supabaseAdmin
      .from("geocode_cache")
      .select("query", { count: "exact", head: true });

    if (countError) {
      console.error("Error counting geocode cache entries:", countError);
      return;
    }

    const excess = (count ?? 0) - MAX_CACHE_ROWS;
    if (excess <= 0) return;

    const { data: oldestRows, error: oldestError } = await supabaseAdmin
      .from("geocode_cache")
      .select("query")
      .order("created_at", { ascending: true })
      .limit(excess);

    if (oldestError) {
      console.error(
        "Error selecting geocode cache entries to evict:",
        oldestError,
      );
      return;
    }

    const queries = (oldestRows as Array<Pick<GeocodeCacheRow, "query">>).map(
      (row) => row.query,
    );
    if (queries.length === 0) return;

    const { error: deleteError } = await supabaseAdmin
      .from("geocode_cache")
      .delete()
      .in("query", queries);

    if (deleteError) {
      console.error("Error evicting geocode cache entries:", deleteError);
    }
  } catch (error) {
    console.error("Error pruning geocode cache:", error);
  }
}
