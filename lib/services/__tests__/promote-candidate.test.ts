import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabaseAdmin } from "@/lib/supabase";
import {
  promoteCandidate,
  rejectCandidate,
} from "@/lib/services/promote-candidate";

const candidate = {
  id: "candidate-1",
  name: "Berlin AI Hackathon",
  url: "https://www.lu.ma/berlin-ai?utm_source=search",
  promoted_at: null,
  promoted_hackathon_id: null,
};

function mockCandidateLookup(data: unknown = candidate, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  vi.mocked(supabaseAdmin.from).mockReturnValue({ select } as never);
  return { select, eq, maybeSingle };
}

describe("promoteCandidate", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns not_found without attempting an RPC when the candidate is absent", async () => {
    mockCandidateLookup(null);

    const result = await promoteCandidate("missing-candidate");

    expect(result).toEqual({ outcome: "not_found" });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it("delegates promotion and normalized-URL identity to the atomic RPC", async () => {
    mockCandidateLookup();
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: { outcome: "promoted", hackathon_id: "hackathon-1" },
      error: null,
    } as never);

    const result = await promoteCandidate(candidate.id);

    expect(result).toEqual({
      outcome: "promoted",
      hackathonId: "hackathon-1",
    });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "promote_hackathon_candidate",
      {
        p_candidate_id: candidate.id,
        p_topics: expect.any(Array),
      },
    );
    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.from).toHaveBeenCalledWith("hackathon_candidates");
  });

  it.each([
    [
      { outcome: "already_promoted", hackathon_id: "hackathon-1" },
      { outcome: "already_promoted", hackathonId: "hackathon-1" },
    ],
    [
      { outcome: "duplicate_url", existing_hackathon_id: "hackathon-2" },
      { outcome: "duplicate_url", existingHackathonId: "hackathon-2" },
    ],
  ])("maps an idempotent RPC outcome", async (rpcData, expected) => {
    mockCandidateLookup();
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: rpcData,
      error: null,
    } as never);

    await expect(promoteCandidate(candidate.id)).resolves.toEqual(expected);
  });

  it("surfaces an RPC error instead of claiming that promotion succeeded", async () => {
    mockCandidateLookup();
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: null,
      error: { message: "promotion transaction failed" },
    } as never);

    await expect(promoteCandidate(candidate.id)).resolves.toEqual({
      outcome: "error",
      message: "promotion transaction failed",
    });
  });

  it("rejects a malformed RPC response", async () => {
    mockCandidateLookup();
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: { outcome: "promoted" },
      error: null,
    } as never);

    await expect(promoteCandidate(candidate.id)).resolves.toEqual({
      outcome: "error",
      message: "Promotion RPC returned an invalid response",
    });
  });

  it("surfaces a rejection update error", async () => {
    const eq = vi.fn().mockResolvedValue({
      error: { message: "candidate update failed" },
    });
    const update = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabaseAdmin.from).mockReturnValue({ update } as never);

    await expect(
      rejectCandidate("candidate-1", "not an event"),
    ).rejects.toThrow("candidate update failed");
  });
});
