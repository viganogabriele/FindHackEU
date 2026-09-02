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
import {
  moveCandidateToPending,
  type MoveCandidateToPendingResult,
} from "@/lib/services/candidate-moderation";
import {
  requireAdminAuth,
  getAdminAuthStatus,
} from "@/lib/services/require-admin-auth";
import {
  addAdminUser,
  removeAdminUser,
  type AddAdminResult,
  type RemoveAdminResult,
} from "@/lib/services/admin-users";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Server actions backing /admin. Admin is now available in production too
 * (maintainer request, 2026-09-02) - the real security boundary is
 * `requireAdminAuth()` (a genuine Google-OAuth-backed session check against
 * `ADMIN_ALLOWED_EMAIL`/the `admin_users` table), not environment. Every
 * action still re-checks auth itself (not just relying on the page being
 * unreachable/hiding its buttons) since a server action is its own callable
 * endpoint once the client has the page loaded.
 */
async function assertAuthorized() {
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

  revalidatePath("/admin");
}

export async function rejectCandidateAction(
  candidateId: string,
  reviewerNote?: string,
): Promise<void> {
  await assertAuthorized();

  await rejectCandidate(candidateId, reviewerNote);

  revalidatePath("/admin");
}

export async function moveCandidateToPendingAction(
  candidateId: string,
): Promise<MoveCandidateToPendingResult> {
  await assertAuthorized();

  const result = await moveCandidateToPending(supabaseAdmin, candidateId);

  if (result.outcome === "updated") {
    revalidatePath("/admin");
  }

  return result;
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

  revalidatePath("/admin");
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
    revalidatePath("/admin");
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
    revalidatePath("/admin");
  }

  return result;
}

/**
 * Adds a new admin to the `admin_users` table (issue #18) - the "Manage
 * admins" tab's Add form. Any currently-authorized admin can add another
 * (there is no separate "super-admin" tier - the `ADMIN_ALLOWED_EMAIL`
 * fallback account is what's structurally protected, not a role
 * distinction between admins). `added_by` is the acting admin's own email,
 * read fresh from the current session rather than trusted from the form,
 * so it can't be spoofed by a client-controlled field.
 */
export async function addAdminFormAction(
  _prevState: AddAdminResult | null,
  formData: FormData,
): Promise<AddAdminResult> {
  await assertAuthorized();

  const { email: actingAdminEmail } = await getAdminAuthStatus();

  const result = await addAdminUser(
    supabaseAdmin,
    String(formData.get("email") ?? ""),
    actingAdminEmail,
  );

  if (result.outcome === "added") {
    revalidatePath("/admin");
  }

  return result;
}

/**
 * Removes an admin from the `admin_users` table (issue #18). Self-removal
 * is blocked inside `removeAdminUser` itself (not just in the UI) - see its
 * doc comment in lib/services/admin-users.ts for why. The acting admin's
 * email is read fresh from the current session, same as
 * `addAdminFormAction`, so the self-removal check can't be bypassed by a
 * spoofed form field.
 */
export async function removeAdminAction(
  email: string,
): Promise<RemoveAdminResult> {
  await assertAuthorized();

  const { email: actingAdminEmail } = await getAdminAuthStatus();

  const result = await removeAdminUser(supabaseAdmin, email, actingAdminEmail);

  if (result.outcome === "removed") {
    revalidatePath("/admin");
  }

  return result;
}
