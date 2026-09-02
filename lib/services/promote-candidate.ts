import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase";
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
 * `types/database.ts` declares no `Functions`, so `Database["public"]`
 * doesn't structurally match supabase-js's `GenericSchema` and `.rpc()`
 * types its arguments as `undefined` - the same repo-wide rough edge that
 * makes a plain `.select()` resolve to `never` (CLAUDE.md, "Data model").
 * `lib/services/candidate-moderation.ts` already works around it exactly
 * this way for `move_candidate_to_pending`; this follows that pattern
 * rather than reshaping the shared database types from inside this fix.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

interface PromoteRpcOutcome {
  outcome?: unknown;
  hackathon_id?: unknown;
  existing_hackathon_id?: unknown;
}

/**
 * Copies an approved `hackathon_candidates` row into the real `hackathons`
 * table - the only path by which a web-search-discovered event becomes a
 * published one (see the hackathon_candidates migration's doc comment).
 * Used by both the admin review page's "Approve" action and, symmetrically,
 * a previously-rejected row's "Approve anyway" action for a false negative.
 *
 * The find-duplicate/insert/mark-approved sequence runs inside the
 * `promote_hackathon_candidate` Postgres function
 * (supabase/migrations/20260901100000_atomic_candidate_promotion.sql), not
 * here. That migration was written specifically to fix two problems with
 * doing it in application code, and both were still live because the
 * function was never actually called:
 *
 *   1. **The duplicate check didn't do what it claimed.** It selected with
 *      `.eq("url", candidate.url)` - an exact string match - and only then
 *      compared `normalizeUrl(row.url)` against the candidate's normalized
 *      URL, which is trivially true for every row an exact match can
 *      return. So an event already stored under an equivalent-but-different
 *      URL (`lu.ma` vs `luma.com`, `www.`, a trailing slash, a `utm_*`
 *      parameter) was never recognized. The insert then hit the
 *      `hackathons_set_normalized_url` trigger's uniqueness check and came
 *      back as `outcome: "error"` carrying a raw Postgres message, instead
 *      of the graceful `duplicate_url` this function defines. Reproduced
 *      live against local Supabase: promoting a `https://www.luma.com/x/?utm_source=y`
 *      candidate against a stored `https://lu.ma/x` returned
 *      `{"outcome":"error","message":"hackathon URL already exists: luma.com/x"}`,
 *      which `approveCandidateAction` rethrows - leaving the candidate
 *      stuck in Pending with no way to resolve it from the UI.
 *   2. **Two concurrent approvals could both insert.** Nothing serialized
 *      the read against the write. The function takes `for update` on the
 *      candidate row plus a `pg_advisory_xact_lock` on the normalized URL.
 *
 * Topics stay a caller decision because the function takes them as a
 * parameter: a submitter's explicit choices win, and auto-extraction from
 * the title is only the fallback for a web-search candidate that never had
 * a chance to specify any. The pre-read that feeds it is not part of the
 * race - the function re-reads the row under a lock.
 *
 * A direct `.select(...)` result cast to its `Database[...]["Row"]` type
 * (rather than trusting Supabase's own inferred type) is a pre-existing,
 * repo-wide rough edge, not something new here; CLAUDE.md documents the
 * equivalent gap for insert/update shapes as expected.
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

  const topics =
    candidate.topics && candidate.topics.length > 0
      ? candidate.topics
      : defaultTopicExtractor.extractTopics(candidate.name);

  const { data, error } = await (supabaseAdmin as AnySupabaseClient).rpc(
    "promote_hackathon_candidate",
    { p_candidate_id: candidateId, p_topics: topics },
  );

  if (error) {
    return { outcome: "error", message: error.message };
  }

  const result = (data ?? {}) as PromoteRpcOutcome;
  const hackathonId =
    typeof result.hackathon_id === "string" ? result.hackathon_id : null;
  const existingHackathonId =
    typeof result.existing_hackathon_id === "string"
      ? result.existing_hackathon_id
      : null;

  switch (result.outcome) {
    case "promoted":
      return hackathonId
        ? { outcome: "promoted", hackathonId }
        : { outcome: "error", message: "Promotion returned no hackathon id" };
    case "already_promoted":
      return hackathonId
        ? { outcome: "already_promoted", hackathonId }
        : { outcome: "error", message: "Promotion returned no hackathon id" };
    case "duplicate_url":
      return existingHackathonId
        ? { outcome: "duplicate_url", existingHackathonId }
        : { outcome: "error", message: "Promotion returned no hackathon id" };
    case "not_found":
      return { outcome: "not_found" };
    default:
      return { outcome: "error", message: "Unexpected promotion outcome" };
  }
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
