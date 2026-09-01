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

/**
 * Server actions backing /admin/candidates. Every action re-checks
 * NODE_ENV itself (not just relying on the page being unreachable) since
 * a server action is its own callable endpoint once the client has the
 * page loaded - see app/admin/candidates/page.tsx's doc comment for why
 * this whole area is dev-only until issue #67 (Google-auth-gated access) lands.
 */
function assertDevOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Not available outside development");
  }
}

export async function approveCandidateAction(
  candidateId: string,
): Promise<void> {
  assertDevOnly();

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
  assertDevOnly();

  await rejectCandidate(candidateId, reviewerNote);

  revalidatePath("/admin/candidates");
}

export async function submitManualCandidateFormAction(
  _prevState: SubmitManualCandidateResult | null,
  formData: FormData,
): Promise<SubmitManualCandidateResult> {
  assertDevOnly();

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
