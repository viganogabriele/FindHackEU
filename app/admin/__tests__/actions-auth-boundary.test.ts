import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  promoteCandidate: vi.fn(),
  rejectCandidate: vi.fn(),
  moveCandidateToPending: vi.fn(),
  submitManualCandidate: vi.fn(),
  editHackathon: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/services/require-admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));
vi.mock("@/lib/services/promote-candidate", () => ({
  promoteCandidate: mocks.promoteCandidate,
  rejectCandidate: mocks.rejectCandidate,
  moveCandidateToPending: mocks.moveCandidateToPending,
}));
vi.mock("@/lib/services/submit-manual-candidate", () => ({
  submitManualCandidate: mocks.submitManualCandidate,
}));
vi.mock("@/lib/services/edit-hackathon", () => ({
  editHackathon: mocks.editHackathon,
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
  moveCandidateToPendingAction,
  submitManualCandidateFormAction,
} from "../actions";
import {
  deleteHackathonAction,
  archiveHackathonAction,
  unarchiveHackathonAction,
  setHackathonModerationStateAction,
  editHackathonFormAction,
} from "../hackathons/actions";

const protectedActions = [
  ["approveCandidateAction", () => approveCandidateAction("candidate-id")],
  ["rejectCandidateAction", () => rejectCandidateAction("candidate-id")],
  [
    "moveCandidateToPendingAction",
    () => moveCandidateToPendingAction("candidate-id"),
  ],
  ["deleteCandidateAction", () => deleteCandidateAction("candidate-id")],
  [
    "submitManualCandidateFormAction",
    () => submitManualCandidateFormAction(null, new FormData()),
  ],
  ["deleteHackathonAction", () => deleteHackathonAction("hackathon-id")],
  // Issue #72: archive/unarchive are also destructive-ish (archive removes
  // a public listing) and must re-check auth themselves, same as every
  // other action here.
  [
    "archiveHackathonAction",
    () => archiveHackathonAction("hackathon-id", "reason"),
  ],
  ["unarchiveHackathonAction", () => unarchiveHackathonAction("hackathon-id")],
  [
    "editHackathonFormAction",
    () => editHackathonFormAction("hackathon-id", null, new FormData()),
  ],
  // Issue #102: the new moderation-state transition action must also
  // re-check auth itself, same as every other action here - it's a
  // separately-callable server action, not protected merely by the page
  // hiding its buttons.
  [
    "setHackathonModerationStateAction",
    () => setHackathonModerationStateAction("hackathon-id", "pending"),
  ],
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
      expect(mocks.editHackathon).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("passes published-hackathon form fields to the edit service and revalidates affected paths", async () => {
    mocks.requireAdminAuth.mockResolvedValue(undefined);
    mocks.editHackathon.mockResolvedValue({ outcome: "updated" });

    const formData = new FormData();
    formData.set("url", "https://example.org/updated-event");
    formData.set("name", "Updated Hackathon");
    formData.set("city", "Berlin");
    formData.set("countryCode", "Germany");
    formData.set("dateStart", "2026-12-01");
    formData.append("topics", "AI");
    formData.append("topics", "Web3");

    const result = await editHackathonFormAction(
      "hackathon-id",
      null,
      formData,
    );

    expect(result).toEqual({ outcome: "updated" });
    expect(mocks.editHackathon).toHaveBeenCalledWith({
      hackathonId: "hackathon-id",
      url: "https://example.org/updated-event",
      name: "Updated Hackathon",
      city: "Berlin",
      countryCode: "Germany",
      dateStart: "2026-12-01",
      topics: ["AI", "Web3"],
    });
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(1, "/admin");
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(2, "/api/hackathons");
  });

  it("returns validation errors without revalidating when the edit service rejects the form", async () => {
    mocks.requireAdminAuth.mockResolvedValue(undefined);
    mocks.editHackathon.mockResolvedValue({
      outcome: "invalid",
      message: "Invalid date.",
    });

    const result = await editHackathonFormAction(
      "hackathon-id",
      null,
      new FormData(),
    );

    expect(result).toEqual({ outcome: "invalid", message: "Invalid date." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
