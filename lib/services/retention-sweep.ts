import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/services/fetch-all-rows";
import { archiveHackathon } from "@/lib/services/archive-hackathon";

/**
 * Automatic retention sweep (issue #72 follow-up comment, 2026-09-01): any
 * `hackathons` row with `status = "past"` whose end date (or start date, if
 * no end date was recorded) is more than a year in the past gets archived -
 * reusing the exact same `archiveHackathon` mechanism the manual "Archive"
 * button uses, not a separate implementation. Called from
 * app/api/archive-old-hackathons/route.ts, a new endpoint hit by a separate
 * cron entry in .github/workflows/update.yml - deliberately NOT wired into
 * app/api/update/route.ts itself, per the issue: this is a distinct
 * concern from the main scrape/dedupe/notify pipeline and shouldn't change
 * its behavior.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

export const RETENTION_DAYS = 365;

export const RETENTION_ARCHIVE_REASON = "retention: past for over a year";

interface RetentionCandidateRow {
  id: string;
  status: "upcoming" | "past" | "estimated";
  date_start: string;
  date_end: string | null;
  archived_at: string | null;
}

/**
 * Pure date-cutoff decision, factored out of the Supabase-calling sweep
 * below so the "more than a year past date_end, or date_start if no
 * date_end" math can be unit-tested without a database.
 */
export function isEligibleForRetentionArchive(
  hackathon: Pick<
    RetentionCandidateRow,
    "status" | "date_start" | "date_end" | "archived_at"
  >,
  now: Date = new Date(),
): boolean {
  if (hackathon.archived_at) {
    return false;
  }

  if (hackathon.status !== "past") {
    return false;
  }

  const referenceDate = hackathon.date_end ?? hackathon.date_start;
  const referenceMs = new Date(referenceDate).getTime();

  if (Number.isNaN(referenceMs)) {
    // Genuinely unparseable date - never archive on the strength of a bad
    // value, since the whole cutoff computation would be meaningless.
    return false;
  }

  const elapsedMs = now.getTime() - referenceMs;

  return elapsedMs > RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

export interface RetentionSweepResult {
  checked: number;
  archived: number;
  skipped: number;
  errors: Array<{ id: string; message: string }>;
}

/**
 * Fetches every `status = "past"`, not-yet-archived hackathon (paginated -
 * see fetch-all-rows.ts's doc comment on why an unpaginated select would
 * silently truncate past 1000 rows) and archives every row
 * `isEligibleForRetentionArchive` accepts, via the shared `archiveHackathon`
 * mechanism. A single row's archive failure is recorded in `errors` and
 * does not stop the rest of the sweep, mirroring the rest of this
 * codebase's "one stage's failure doesn't abort the others" convention
 * (see app/api/update/route.ts).
 */
export async function sweepOldPastHackathons(
  supabaseAdmin: AnySupabaseClient,
  options: { now?: Date } = {},
): Promise<RetentionSweepResult> {
  const now = options.now ?? new Date();

  const candidates = await fetchAllRows<RetentionCandidateRow>((from, to) =>
    supabaseAdmin
      .from("hackathons")
      .select("id, status, date_start, date_end, archived_at")
      .eq("status", "past")
      .is("archived_at", null)
      .range(from, to),
  );

  const result: RetentionSweepResult = {
    checked: candidates.length,
    archived: 0,
    skipped: 0,
    errors: [],
  };

  for (const candidate of candidates) {
    if (!isEligibleForRetentionArchive(candidate, now)) {
      result.skipped++;
      continue;
    }

    const outcome = await archiveHackathon(
      supabaseAdmin,
      candidate.id,
      RETENTION_ARCHIVE_REASON,
    );

    if (outcome.outcome === "archived") {
      result.archived++;
    } else if (outcome.outcome === "error") {
      result.errors.push({
        id: candidate.id,
        message: outcome.message ?? "Unknown error",
      });
    } else {
      // "already_archived"/"not_found" - a concurrent change since the
      // fetch above; not this sweep's own error.
      result.skipped++;
    }
  }

  return result;
}
