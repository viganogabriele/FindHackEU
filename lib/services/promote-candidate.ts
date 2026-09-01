import { supabaseAdmin } from "@/lib/supabase";
import { defaultTopicExtractor } from "@/lib/topic-extractor";
import type { Database } from "@/types/database";

type CandidateRow = Database["public"]["Tables"]["hackathon_candidates"]["Row"];

interface PromotionRpcResponse {
  outcome: string;
  hackathon_id?: string;
  existing_hackathon_id?: string;
}

interface PromotionRpcClient {
  rpc(
    functionName: "promote_hackathon_candidate",
    args: {
      p_candidate_id: string;
      p_topics: string[];
    },
  ): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

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
 * The read is only used to obtain the candidate's name for topic extraction.
 * The actual status check, normalized-URL lookup, insert, and candidate
 * update happen in one database RPC transaction protected by a per-URL
 * advisory lock, so two concurrent approvals cannot both insert.
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

  const { data, error } = await (
    supabaseAdmin as unknown as PromotionRpcClient
  ).rpc("promote_hackathon_candidate", {
    p_candidate_id: candidateId,
    p_topics: defaultTopicExtractor.extractTopics(candidate.name),
  });

  if (error) {
    return { outcome: "error", message: error.message };
  }

  return mapPromotionRpcResponse(data);
}

function mapPromotionRpcResponse(data: unknown): PromoteResult {
  if (!isPromotionRpcResponse(data)) {
    return {
      outcome: "error",
      message: "Promotion RPC returned an invalid response",
    };
  }

  switch (data.outcome) {
    case "promoted":
      return data.hackathon_id
        ? { outcome: "promoted", hackathonId: data.hackathon_id }
        : {
            outcome: "error",
            message: "Promotion RPC returned an invalid response",
          };
    case "already_promoted":
      return data.hackathon_id
        ? { outcome: "already_promoted", hackathonId: data.hackathon_id }
        : {
            outcome: "error",
            message: "Promotion RPC returned an invalid response",
          };
    case "duplicate_url":
      return data.existing_hackathon_id
        ? {
            outcome: "duplicate_url",
            existingHackathonId: data.existing_hackathon_id,
          }
        : {
            outcome: "error",
            message: "Promotion RPC returned an invalid response",
          };
    case "not_found":
      return { outcome: "not_found" };
    default:
      return {
        outcome: "error",
        message: "Promotion RPC returned an invalid response",
      };
  }
}

function isPromotionRpcResponse(data: unknown): data is PromotionRpcResponse {
  if (typeof data !== "object" || data === null) return false;

  const response = data as Record<string, unknown>;
  return (
    typeof response.outcome === "string" &&
    (response.hackathon_id === undefined ||
      typeof response.hackathon_id === "string") &&
    (response.existing_hackathon_id === undefined ||
      typeof response.existing_hackathon_id === "string")
  );
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
