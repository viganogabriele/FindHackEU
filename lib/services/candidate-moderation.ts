import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

export type MoveCandidateToPendingResult =
  | { outcome: "updated" }
  | { outcome: "unchanged" }
  | { outcome: "not_found" }
  | { outcome: "error"; message: string };

/** Returns a rejected candidate to the active review queue. */
export async function moveCandidateToPending(
  supabaseAdmin: AnySupabaseClient,
  candidateId: string,
): Promise<MoveCandidateToPendingResult> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("hackathon_candidates")
    .select("id, status")
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchError) {
    return { outcome: "error", message: fetchError.message };
  }

  if (!existing) {
    return { outcome: "not_found" };
  }

  if ((existing as { status: string }).status !== "rejected") {
    return { outcome: "unchanged" };
  }

  const { error } = await supabaseAdmin
    .from("hackathon_candidates")
    .update({ status: "pending", reviewed_at: null, reviewer_note: null })
    .eq("id", candidateId);

  return error
    ? { outcome: "error", message: error.message }
    : { outcome: "updated" };
}
