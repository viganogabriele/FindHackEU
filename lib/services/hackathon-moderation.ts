import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The moderation-state transition mechanism for a `hackathons` row (issue
 * #102) - the counterpart to `lib/services/archive-hackathon.ts`'s
 * archive/unarchive mechanism, but for a fully independent concern.
 * `archived_at` is purely about date-based retention (issue #72); this file
 * is purely about editorial "should this be public right now" judgment,
 * deliberately not conflated into one column meaning two things via
 * string-matching on a reason field or similar.
 *
 * This is what lets an already-published hackathon (most of them - the ones
 * the main scraping pipeline auto-inserted directly, which never had a
 * `hackathon_candidates` row at all) move back to "pending" or be marked
 * "rejected" without hard-deleting it, and symmetrically lets a
 * pending/rejected one be (re-)approved. A candidate-sourced row keeps using
 * `promoteCandidate()`/`rejectCandidate()` (lib/services/promote-candidate.ts)
 * unchanged - this file only exists for hackathons that already have (or
 * need to gain/lose) a real `hackathons` row of their own.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

export type ModerationState = "approved" | "pending" | "rejected";

export const MODERATION_STATES: ModerationState[] = [
  "approved",
  "pending",
  "rejected",
];

export interface SetModerationStateResult {
  outcome: "updated" | "unchanged" | "not_found" | "error";
  message?: string;
}

/**
 * Moves a `hackathons` row to a new `moderation_state`. Idempotent - setting
 * a row to the state it's already in is reported as `"unchanged"` rather
 * than issuing a no-op UPDATE, mirroring `archiveHackathon`'s
 * `already_archived` short-circuit.
 */
export async function setHackathonModerationState(
  supabaseAdmin: AnySupabaseClient,
  hackathonId: string,
  state: ModerationState,
): Promise<SetModerationStateResult> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("hackathons")
    .select("id, moderation_state")
    .eq("id", hackathonId)
    .maybeSingle();

  if (fetchError) {
    return { outcome: "error", message: fetchError.message };
  }

  if (!existing) {
    return { outcome: "not_found" };
  }

  if (
    (existing as { moderation_state: ModerationState }).moderation_state ===
    state
  ) {
    return { outcome: "unchanged" };
  }

  const { error } = await supabaseAdmin
    .from("hackathons")
    .update({ moderation_state: state })
    .eq("id", hackathonId);

  if (error) {
    return { outcome: "error", message: error.message };
  }

  return { outcome: "updated" };
}
