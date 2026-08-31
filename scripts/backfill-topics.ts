#!/usr/bin/env tsx
/**
 * One-off maintenance script for issue #28: re-runs the (now-fixed, see
 * issue #8) topic extractor against hackathon rows that were inserted
 * before that fix and therefore have empty/null `topics`.
 *
 * IMPORTANT LIMITATION: the `hackathons` table only stores `name` and
 * `notes` (a Lablab-specific field, usually null for Luma rows) - the
 * original event *description* that topic extraction also normally uses
 * is never persisted. This backfill can therefore only re-extract from
 * `name` (+ `notes` when present), so it will likely find fewer/different
 * topics than a fresh ingestion of the same event would from its full
 * description. It's still strictly better than the current empty state,
 * but don't expect it to be exhaustive.
 *
 * Safety: this WRITES to whatever database NEXT_PUBLIC_SUPABASE_URL/
 * SUPABASE_SERVICE_ROLE_KEY point to. Defaults to a dry run (prints what
 * would change, writes nothing) - pass --write to actually persist.
 *
 * Usage:
 *   npx tsx scripts/backfill-topics.ts            # dry run
 *   npx tsx scripts/backfill-topics.ts --write     # actually update rows
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { supabaseAdmin } = await import("../lib/supabase");
  const { defaultTopicExtractor } = await import("../lib/topic-extractor");
  const { fetchAllRows } = await import("../lib/services/fetch-all-rows");

  const shouldWrite = process.argv.includes("--write");

  console.log(
    shouldWrite
      ? "Running in WRITE mode - rows will be updated."
      : "Running in DRY-RUN mode (default) - pass --write to persist changes.",
  );

  interface CandidateRow {
    id: string;
    name: string;
    notes: string | null;
    topics: string[] | null;
  }

  // Paginated (see lib/services/fetch-all-rows.ts) - on a table with more
  // than PostgREST's max_rows worth of empty-topic rows, a plain select
  // would silently only backfill the first page and report success
  // (found in code review).
  const candidates = await fetchAllRows<CandidateRow>((from, to) =>
    supabaseAdmin
      .from("hackathons")
      .select("id, name, notes, topics")
      .or("topics.is.null,topics.eq.{}")
      // Stable order so a concurrent insert/update during this scan can't
      // shift row positions between pages (found in code review).
      .order("id", { ascending: true })
      .range(from, to),
  );

  console.log(`Found ${candidates.length} hackathon(s) with empty topics.`);

  let wouldUpdateCount = 0;
  let updatedCount = 0;
  let stillEmptyCount = 0;

  for (const row of candidates) {
    const topics = defaultTopicExtractor.extractTopics(
      row.name,
      row.notes ?? undefined,
    );

    if (topics.length === 0) {
      stillEmptyCount++;
      continue;
    }

    wouldUpdateCount++;
    console.log(
      `${shouldWrite ? "Updating" : "Would update"} "${row.name}" -> [${topics.join(", ")}]`,
    );

    if (shouldWrite) {
      const { error: updateError } = await supabaseAdmin
        .from("hackathons")
        // @ts-expect-error - Supabase generated types may not include update shape
        .update({ topics, updated_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateError) {
        console.error(`Failed to update "${row.name}":`, updateError);
        continue;
      }

      updatedCount++;
    }
  }

  console.log(
    shouldWrite
      ? `Done. Updated ${updatedCount}/${candidates.length} rows; ` +
          `${stillEmptyCount} had no extractable topic even after re-running the fixed extractor.`
      : `Dry run complete. ${wouldUpdateCount}/${candidates.length} rows would be updated; ` +
          `${stillEmptyCount} would remain empty. Re-run with --write to apply.`,
  );
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exitCode = 1;
});
