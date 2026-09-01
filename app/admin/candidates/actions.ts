"use server";

import { revalidatePath } from "next/cache";
import {
  promoteCandidate,
  rejectCandidate,
} from "@/lib/services/promote-candidate";
import {
  submitManualCandidate,
  type SubmitManualCandidateResult,
} from "@/lib/services/submit-manual-candidate";
import {
  editCandidate,
  type EditCandidateResult,
} from "@/lib/services/edit-candidate";
import { requireAdminAuth } from "@/lib/services/require-admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Server actions backing /admin/candidates. Every action re-checks both
 * NODE_ENV and admin auth itself (not just relying on the page being
 * unreachable/hiding its buttons) since a server action is its own callable
 * endpoint once the client has the page loaded.
 */
function assertDevOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Not available outside development");
  }
}

/**
 * Real server-side authorization check (issue #67) - requires a Supabase
 * Auth session whose email matches `ADMIN_ALLOWED_EMAIL`. Hiding the
 * Approve/Reject buttons in the UI when signed out is not security on its
 * own; this is what actually stops an unauthenticated caller from invoking
 * these actions directly.
 */
async function assertAuthorized() {
  assertDevOnly();
  await requireAdminAuth();
}

export async function approveCandidateAction(
  candidateId: string,
): Promise<void> {
  await assertAuthorized();

  const result = await promoteCandidate(candidateId);

  if (result.outcome === "error") {
    throw new Error(result.message);
  }

  revalidatePath("/admin/candidates");
}

export async function rejectCandidateAction(
  candidateId: string,
  reviewerNote?: string,
): Promise<void> {
  await assertAuthorized();

  await rejectCandidate(candidateId, reviewerNote);

  revalidatePath("/admin/candidates");
}

/**
 * Permanently removes a `hackathon_candidates` row - distinct from
 * `rejectCandidateAction` (which keeps the row, marked `rejected`, so a
 * false negative can still be approved later). Delete is for genuine
 * cleanup: junk/duplicate/test candidates that shouldn't linger in any
 * tab at all. Requested directly by the maintainer while using the
 * dashboard (2026-09-01), alongside the equivalent for published
 * hackathons (see app/admin/hackathons/actions.ts).
 */
export async function deleteCandidateAction(
  candidateId: string,
): Promise<void> {
  await assertAuthorized();

  const { error } = await supabaseAdmin
    .from("hackathon_candidates")
    .delete()
    .eq("id", candidateId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/candidates");
}

/**
 * Issue #94 - saves an in-place edit to a still-pending (or rejected)
 * candidate row (name/date/city/country/topics), backed by
 * `lib/services/edit-candidate.ts`'s plain `UPDATE`. Distinct from
 * `approveCandidateAction`/`promoteCandidate()`: this never touches
 * `hackathons`, it just corrects the source row an eventual Approve will
 * copy from.
 */
export async function editCandidateFormAction(
  candidateId: string,
  _prevState: EditCandidateResult | null,
  formData: FormData,
): Promise<EditCandidateResult> {
  await assertAuthorized();

  const result = await editCandidate({
    candidateId,
    name: String(formData.get("name") ?? ""),
    city: String(formData.get("city") ?? ""),
    countryCode: String(formData.get("countryCode") ?? ""),
    dateStart: String(formData.get("dateStart") ?? ""),
    topics: formData.getAll("topics").map(String),
  });

  if (result.outcome === "updated") {
    revalidatePath("/admin/candidates");
  }

  return result;
}

export async function submitManualCandidateFormAction(
  _prevState: SubmitManualCandidateResult | null,
  formData: FormData,
): Promise<SubmitManualCandidateResult> {
  await assertAuthorized();

  const result = await submitManualCandidate({
    url: String(formData.get("url") ?? ""),
    name: String(formData.get("name") ?? ""),
    city: String(formData.get("city") ?? ""),
    countryCode: String(formData.get("countryCode") ?? ""),
    dateStart: String(formData.get("dateStart") ?? ""),
    topics: formData.getAll("topics").map(String),
  });

  if (result.outcome === "created") {
    revalidatePath("/admin/candidates");
  }

  return result;
}
