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
  const { data: outcome, error } = await supabaseAdmin.rpc(
    "move_candidate_to_pending",
    { candidate_id: candidateId },
  );

  if (error) return { outcome: "error", message: error.message };
  if (outcome === "updated") return { outcome: "updated" };
  if (outcome === "unchanged") return { outcome: "unchanged" };
  if (outcome === "not_found") return { outcome: "not_found" };
  return { outcome: "error", message: "Unexpected moderation outcome" };
}
