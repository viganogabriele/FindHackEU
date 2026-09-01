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
import { requireAdminAuth } from "@/lib/services/require-admin-auth";

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
  });

  if (result.outcome === "created") {
    revalidatePath("/admin/candidates");
  }

  return result;
}
