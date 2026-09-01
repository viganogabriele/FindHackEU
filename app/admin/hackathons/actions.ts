"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAuth } from "@/lib/services/require-admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

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
 * (2026-09-01). This is a hard delete, not the more elaborate reversible
 * "archive with a reason" design sketched in issue #72 - simpler, on
 * purpose, per what was actually asked for.
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
