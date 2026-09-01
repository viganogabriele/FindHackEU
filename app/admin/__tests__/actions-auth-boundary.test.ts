import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  promoteCandidate: vi.fn(),
  rejectCandidate: vi.fn(),
  submitManualCandidate: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/services/require-admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));
vi.mock("@/lib/services/promote-candidate", () => ({
  promoteCandidate: mocks.promoteCandidate,
  rejectCandidate: mocks.rejectCandidate,
}));
vi.mock("@/lib/services/submit-manual-candidate", () => ({
  submitManualCandidate: mocks.submitManualCandidate,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mocks.from },
}));

import {
  approveCandidateAction,
  deleteCandidateAction,
  rejectCandidateAction,
  submitManualCandidateFormAction,
} from "../candidates/actions";
import { deleteHackathonAction } from "../hackathons/actions";

const protectedActions = [
  ["approveCandidateAction", () => approveCandidateAction("candidate-id")],
  ["rejectCandidateAction", () => rejectCandidateAction("candidate-id")],
  ["deleteCandidateAction", () => deleteCandidateAction("candidate-id")],
  [
    "submitManualCandidateFormAction",
    () => submitManualCandidateFormAction(null, new FormData()),
  ],
  ["deleteHackathonAction", () => deleteHackathonAction("hackathon-id")],
] as const;

describe("admin server actions", () => {
  beforeEach(() => {
    mocks.requireAdminAuth.mockRejectedValue(new Error("Not authorized"));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(protectedActions)(
    "%s rejects before touching protected data for an unauthorized caller",
    async (_name, invoke) => {
      await expect(invoke()).rejects.toThrow("Not authorized");

      expect(mocks.promoteCandidate).not.toHaveBeenCalled();
      expect(mocks.rejectCandidate).not.toHaveBeenCalled();
      expect(mocks.submitManualCandidate).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );
});
