import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

export type MoveCandidateToPendingResult =
  | { outcome: "updated" }
  | { outcome: "error"; message: string };

/** Returns a rejected candidate to the active review queue. */
export async function moveCandidateToPending(
  supabaseAdmin: AnySupabaseClient,
  candidateId: string,
): Promise<MoveCandidateToPendingResult> {
  const { error } = await supabaseAdmin
    .from("hackathon_candidates")
    .update({ status: "pending", reviewed_at: null, reviewer_note: null })
    .eq("id", candidateId);

  return error
    ? { outcome: "error", message: error.message }
    : { outcome: "updated" };
}
