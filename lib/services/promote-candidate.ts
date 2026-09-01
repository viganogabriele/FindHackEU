import { supabaseAdmin } from "@/lib/supabase";
import { normalizeUrl } from "@/lib/dedup/url-normalizer";
import { defaultTopicExtractor } from "@/lib/topic-extractor";
import type { Database } from "@/types/database";

type CandidateRow = Database["public"]["Tables"]["hackathon_candidates"]["Row"];

export type PromoteResult =
  | { outcome: "promoted"; hackathonId: string }
  | { outcome: "already_promoted"; hackathonId: string }
  | { outcome: "duplicate_url"; existingHackathonId: string }
  | { outcome: "not_found" }
  | { outcome: "error"; message: string };

/**
 * Copies an approved `hackathon_candidates` row into the real `hackathons`
 * table - the only path by which a web-search-discovered event becomes a
 * published one (see the hackathon_candidates migration's doc comment).
 * Used by both the admin review page's "Approve" action and, symmetrically,
 * a previously-rejected row's "Approve anyway" action for a false negative.
 *
 * A direct `.select(...)` result cast to its `Database[...]["Row"]` type
 * (rather than trusting Supabase's own inferred type) is a pre-existing,
 * repo-wide rough edge, not something new here - confirmed live that even
 * `supabaseAdmin.from("hackathons").select("id, url")` alone resolves to
 * `never` in this project's current Supabase client setup outside the
 * `fetchAllRows<T>` wrapper other code happens to always go through.
 * CLAUDE.md already documents the equivalent gap for insert/update shapes
 * as expected, not a bug to "fix" by loosening types elsewhere; this
 * follows the same rule for selects.
 *
 * Idempotent: re-approving an already-promoted candidate returns
 * `"already_promoted"` instead of inserting a duplicate row.
 */
export async function promoteCandidate(
  candidateId: string,
): Promise<PromoteResult> {
  const { data: candidateData, error: fetchError } = await supabaseAdmin
    .from("hackathon_candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchError) {
    return { outcome: "error", message: fetchError.message };
  }

  const candidate = candidateData as CandidateRow | null;

  if (!candidate) {
    return { outcome: "not_found" };
  }
  if (candidate.promoted_at && candidate.promoted_hackathon_id) {
    return {
      outcome: "already_promoted",
      hackathonId: candidate.promoted_hackathon_id,
    };
  }

  const normalizedCandidateUrl = normalizeUrl(candidate.url);

  // Reuse the same normalized-URL identity the main pipeline's own dedup
  // uses (lib/dedup/url-normalizer.ts) - a candidate whose event has since
  // been picked up by Luma/Devfolio/MLH/ETHGlobal on its own must not
  // become a second row for the same event.
  const { data: existingRowsData, error: existingError } = await supabaseAdmin
    .from("hackathons")
    .select("id, url")
    .eq("url", candidate.url);

  if (existingError) {
    return { outcome: "error", message: existingError.message };
  }

  const existingRows = existingRowsData as Array<{
    id: string;
    url: string;
  }> | null;

  const existing = existingRows?.find(
    (row) => normalizeUrl(row.url) === normalizedCandidateUrl,
  );

  if (existing) {
    await supabaseAdmin
      .from("hackathon_candidates")
      // @ts-expect-error - Supabase generated types may not include update shape
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        promoted_at: new Date().toISOString(),
        promoted_hackathon_id: existing.id,
      })
      .eq("id", candidateId);

    return { outcome: "duplicate_url", existingHackathonId: existing.id };
  }

  const now = new Date();
  const dateStart = candidate.date_start ?? now.toISOString();
  // A candidate with no recoverable structured date is inserted as
  // "estimated" (part of the status enum specifically for this case, per
  // the init migration's own comment) rather than guessed into
  // "upcoming"/"past" - a human approved the event's existence, not a
  // specific date.
  const status = candidate.date_start
    ? new Date(candidate.date_start) < now
      ? "past"
      : "upcoming"
    : "estimated";

  const { data: insertedData, error: insertError } = await supabaseAdmin
    .from("hackathons")
    .insert([
      // @ts-expect-error - Supabase generated types may not include insert shape
      {
        name: candidate.name,
        city: candidate.city,
        country_code: candidate.country_code,
        // A human-submitted or web-search candidate has no reliable
        // location-type signal (issue #21) - explicit "tbd" rather than
        // relying on the DB column default, so this is visible here too.
        location_type: "tbd",
        date_start: dateStart,
        date_end: candidate.date_end,
        // Prefer topics the submitter explicitly chose (manual submission
        // form) over auto-extraction - a human who already knows the event
        // is a much better source of truth than a regex over a short
        // title, which is only a fallback for a web-search-discovered
        // candidate that never had a chance to specify any.
        topics:
          candidate.topics && candidate.topics.length > 0
            ? candidate.topics
            : defaultTopicExtractor.extractTopics(candidate.name),
        url: candidate.url,
        source: "websearch",
        status,
        is_new: true,
      },
    ])
    .select("id")
    .single();

  const inserted = insertedData as { id: string } | null;

  if (insertError || !inserted) {
    return {
      outcome: "error",
      message: insertError?.message ?? "Insert returned no row",
    };
  }

  await supabaseAdmin
    .from("hackathon_candidates")
    // @ts-expect-error - Supabase generated types may not include update shape
    .update({
      status: "approved",
      reviewed_at: now.toISOString(),
      promoted_at: now.toISOString(),
      promoted_hackathon_id: inserted.id,
    })
    .eq("id", candidateId);

  return { outcome: "promoted", hackathonId: inserted.id };
}

export async function rejectCandidate(
  candidateId: string,
  reviewerNote?: string,
): Promise<void> {
  await supabaseAdmin
    .from("hackathon_candidates")
    // @ts-expect-error - Supabase generated types may not include update shape
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewer_note: reviewerNote ?? null,
    })
    .eq("id", candidateId);
}
