import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The single archive/unarchive mechanism for a published `hackathons` row
 * (issue #72). Both producers of archived state go through this file:
 *
 *   1. The manual "Archive" button on a published hackathon in
 *      /admin/candidates's Approved tab (app/admin/hackathons/actions.ts's
 *      `archiveHackathonAction`).
 *   2. The automatic retention sweep (lib/services/retention-sweep.ts,
 *      called from app/api/archive-old-hackathons/route.ts) for a
 *      `status: "past"` hackathon more than a year past its end/start date.
 *
 * Deliberately a soft-delete - sets `archived_at`/`archived_reason` rather
 * than `DELETE`ing the row - per the maintainer's explicit decision in the
 * issue #72 follow-up comment (2026-09-01): recoverable/auditable, not
 * permanently destroyed. `deleteHackathonAction` (hard delete) is a
 * separate, still-available action for genuine junk/mistakes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface ArchiveHackathonResult {
  outcome: "archived" | "already_archived" | "not_found" | "error";
  message?: string;
}

/**
 * Archives a single hackathon (idempotent - archiving an already-archived
 * row is a no-op, reported as `already_archived` rather than overwriting a
 * previously-recorded reason, e.g. a real editorial reason getting silently
 * clobbered by a later retention-sweep pass over the same row).
 */
export async function archiveHackathon(
  supabaseAdmin: AnySupabaseClient,
  hackathonId: string,
  reason: string | null,
): Promise<ArchiveHackathonResult> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("hackathons")
    .select("id, archived_at")
    .eq("id", hackathonId)
    .maybeSingle();

  if (fetchError) {
    return { outcome: "error", message: fetchError.message };
  }

  if (!existing) {
    return { outcome: "not_found" };
  }

  if ((existing as { archived_at: string | null }).archived_at) {
    return { outcome: "already_archived" };
  }

  const { error } = await supabaseAdmin
    .from("hackathons")
    .update({
      archived_at: new Date().toISOString(),
      archived_reason: reason,
    })
    .eq("id", hackathonId)
    .is("archived_at", null);

  if (error) {
    return { outcome: "error", message: error.message };
  }

  return { outcome: "archived" };
}

export interface UnarchiveHackathonResult {
  outcome: "unarchived" | "not_archived" | "not_found" | "error";
  message?: string;
}

/** Clears `archived_at`/`archived_reason`, restoring a hackathon to the public listing. */
export async function unarchiveHackathon(
  supabaseAdmin: AnySupabaseClient,
  hackathonId: string,
): Promise<UnarchiveHackathonResult> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("hackathons")
    .select("id, archived_at")
    .eq("id", hackathonId)
    .maybeSingle();

  if (fetchError) {
    return { outcome: "error", message: fetchError.message };
  }

  if (!existing) {
    return { outcome: "not_found" };
  }

  if (!(existing as { archived_at: string | null }).archived_at) {
    return { outcome: "not_archived" };
  }

  const { error } = await supabaseAdmin
    .from("hackathons")
    .update({ archived_at: null, archived_reason: null })
    .eq("id", hackathonId);

  if (error) {
    return { outcome: "error", message: error.message };
  }

  return { outcome: "unarchived" };
}
