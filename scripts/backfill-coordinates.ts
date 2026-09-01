#!/usr/bin/env tsx
/**
 * Backfill latitude/longitude for existing city-based hackathon rows.
 *
 * Safety: this defaults to a dry run. Pass --write to persist updates and
 * optionally --limit=N to keep a run within the geocoder's monthly quota.
 * The script processes rows sequentially because the OpenAPI geocoder is a
 * paid service after its free allowance.
 *
 * Usage:
 *   npx tsx scripts/backfill-coordinates.ts
 *   npx tsx scripts/backfill-coordinates.ts --limit=100 --write
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function getLimit(): number | null {
  const argument = process.argv.find((value) => value.startsWith("--limit="));
  if (!argument) return null;

  const limit = Number(argument.slice("--limit=".length));
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer");
  }

  return limit;
}

async function main() {
  const { supabaseAdmin } = await import("../lib/supabase");
  const { fetchAllRows } = await import("../lib/services/fetch-all-rows");
  const { GeocodingService } =
    await import("../lib/services/geocoding-service");

  const shouldWrite = process.argv.includes("--write");
  const limit = getLimit();

  console.log(
    shouldWrite
      ? "Running in WRITE mode - rows will be updated."
      : "Running in DRY-RUN mode (default) - pass --write to persist changes.",
  );

  interface CandidateRow {
    id: string;
    name: string;
    city: string | null;
    country_code: string | null;
    latitude: number | null;
    longitude: number | null;
  }

  const rows = await fetchAllRows<CandidateRow>((from, to) =>
    supabaseAdmin
      .from("hackathons")
      .select("id, name, city, country_code, latitude, longitude")
      .order("id", { ascending: true })
      .range(from, to),
  );

  const candidates = rows
    .filter(
      (row) => row.city && (row.latitude === null || row.longitude === null),
    )
    .slice(0, limit ?? undefined);

  console.log(
    `Found ${candidates.length} row(s) needing coordinates` +
      (limit === null ? "." : ` (limit ${limit}).`),
  );

  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of candidates) {
    const outcome = await GeocodingService.getCoordinatesFromAddress(row.city!);

    if (
      (outcome.status !== "found" && outcome.status !== "non_european") ||
      outcome.latitude === undefined ||
      outcome.longitude === undefined
    ) {
      skippedCount++;
      console.log(`Skipping "${row.name}": no usable coordinates.`);
      continue;
    }

    const update = {
      latitude: outcome.latitude,
      longitude: outcome.longitude,
      ...(row.country_code ? {} : { country_code: outcome.countryCode }),
      updated_at: new Date().toISOString(),
    };

    console.log(
      `${shouldWrite ? "Updating" : "Would update"} "${row.name}" -> ` +
        `${outcome.latitude}, ${outcome.longitude}`,
    );

    if (shouldWrite) {
      const { error } = await supabaseAdmin
        .from("hackathons")
        // @ts-expect-error - Supabase generated types may not include update shape
        .update(update)
        .eq("id", row.id);

      if (error) {
        console.error(`Failed to update "${row.name}":`, error);
        skippedCount++;
        continue;
      }
    }

    updatedCount++;
  }

  console.log(
    shouldWrite
      ? `Done. Updated ${updatedCount}/${candidates.length} rows; ${skippedCount} skipped.`
      : `Dry run complete. ${updatedCount}/${candidates.length} rows would be updated; ` +
          `${skippedCount} skipped. Re-run with --write to apply.`,
  );
}

main().catch((error) => {
  console.error("Coordinate backfill failed:", error);
  process.exitCode = 1;
});
