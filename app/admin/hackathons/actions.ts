"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAuth } from "@/lib/services/require-admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  archiveHackathon,
  unarchiveHackathon,
} from "@/lib/services/archive-hackathon";
import {
  setHackathonModerationState,
  type ModerationState,
} from "@/lib/services/hackathon-moderation";
import {
  editHackathon,
  type EditHackathonResult,
} from "@/lib/services/edit-hackathon";

function assertDevOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Not available outside development");
  }
}

async function assertAuthorized() {
  assertDevOnly();
  await requireAdminAuth();
}

/**
 * Permanently removes a published `hackathons` row - e.g. a real but
 * unwanted event (verified live: an Eventbrite listing that literally
 * describes itself as "Il primo Hackathon Sociale in Umbria" - a genuine
 * hackathon by its own classifier-passing title, but a social-innovation
 * event, not the kind of hackathon this project wants listed - the
 * classifier can't capture that editorial judgment, a manual removal can).
 * Requested directly by the maintainer while using the dashboard
 * (2026-09-01). This is a hard, irreversible delete - kept alongside the
 * reversible `archiveHackathonAction` below (issue #72) as the option for
 * genuine junk/mistakes that shouldn't linger anywhere, not for the more
 * common "no longer wanted but not wrong" case, which should use Archive
 * instead.
 *
 * Called from /admin/candidates's Approved tab (issue #82) - the standalone
 * /admin/hackathons page that used to own this action was retired, but the
 * action itself stays here since it has no page-specific dependency.
 */
export async function deleteHackathonAction(
  hackathonId: string,
): Promise<void> {
  await assertAuthorized();

  const { error } = await supabaseAdmin
    .from("hackathons")
    .delete()
    .eq("id", hackathonId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/candidates");
}

/**
 * Soft-deletes a published hackathon (issue #72) - sets
 * `archived_at`/`archived_reason` instead of removing the row, via the
 * shared `archiveHackathon` mechanism (lib/services/archive-hackathon.ts)
 * also used by the automatic retention sweep
 * (lib/services/retention-sweep.ts). This is the softer, reversible default
 * action for "no longer wanted but not wrong" (e.g. the "Social Hackathon
 * Umbria" case from the issue - a real hackathon by title, but not the kind
 * of event this project wants listed); `deleteHackathonAction` above stays
 * available separately for genuine junk/mistakes that don't need to be kept
 * around at all. Archived rows are excluded from the public API
 * (app/api/hackathons/route.ts) and the README, and are managed from the
 * new Archived tab on /admin/candidates.
 */
export async function archiveHackathonAction(
  hackathonId: string,
  reason?: string,
): Promise<void> {
  await assertAuthorized();

  const result = await archiveHackathon(
    supabaseAdmin,
    hackathonId,
    reason?.trim() || null,
  );

  if (result.outcome === "error") {
    throw new Error(result.message);
  }

  revalidatePath("/admin/candidates");
}

/**
 * Reverses `archiveHackathonAction` (or a retention-sweep archive) - clears
 * `archived_at`/`archived_reason`, making the hackathon reachable via the
 * public API and README again. Available from the Archived tab.
 */
export async function unarchiveHackathonAction(
  hackathonId: string,
): Promise<void> {
  await assertAuthorized();

  const result = await unarchiveHackathon(supabaseAdmin, hackathonId);

  if (result.outcome === "error") {
    throw new Error(result.message);
  }

  revalidatePath("/admin/candidates");
}

/**
 * Moves a published `hackathons` row between moderation states (issue #102)
 * - "Move to pending"/"Reject" on an Approved-or-Past card, "Approve"/
 * "Reject" on a Pending-sourced-from-hackathons card, "Approve"/"Move to
 * pending" on a Rejected-sourced-from-hackathons card. Backed by
 * `lib/services/hackathon-moderation.ts`, the counterpart to
 * `archiveHackathonAction`/`unarchiveHackathonAction` above for a fully
 * independent concern (editorial moderation, not date-based retention) - a
 * candidate-sourced Pending/Rejected row keeps using
 * `approveCandidateAction`/`rejectCandidateAction`
 * (app/admin/candidates/actions.ts) unchanged, since this action only
 * touches `hackathons`, never `hackathon_candidates`.
 */
export async function setHackathonModerationStateAction(
  hackathonId: string,
  state: ModerationState,
): Promise<void> {
  await assertAuthorized();

  const result = await setHackathonModerationState(
    supabaseAdmin,
    hackathonId,
    state,
  );

  if (result.outcome === "error") {
    throw new Error(result.message);
  }

  revalidatePath("/admin/candidates");
}

/**
 * Issue #103 - saves an in-place edit to a published `hackathons` row. This
 * is separate from candidate editing because published rows may have been
 * inserted directly by a provider and never had a `hackathon_candidates`
 * record. The service validates all editable fields before its plain UPDATE.
 */
export async function editHackathonFormAction(
  hackathonId: string,
  _prevState: EditHackathonResult | null,
  formData: FormData,
): Promise<EditHackathonResult> {
  await assertAuthorized();

  const result = await editHackathon({
    hackathonId,
    url: String(formData.get("url") ?? ""),
    name: String(formData.get("name") ?? ""),
    city: String(formData.get("city") ?? ""),
    countryCode: String(formData.get("countryCode") ?? ""),
    dateStart: String(formData.get("dateStart") ?? ""),
    topics: formData.getAll("topics").map(String),
  });

  if (result.outcome === "updated") {
    revalidatePath("/admin/candidates");
    revalidatePath("/api/hackathons");
  }

  return result;
}
