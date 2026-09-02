import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabaseAdmin } from "@/lib/supabase";
import { promoteCandidate } from "@/lib/services/promote-candidate";

type CandidateStub = { name: string; topics: string[] | null } | null;

function mockCandidate(candidate: CandidateStub, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: candidate, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  vi.mocked(supabaseAdmin.from).mockReturnValue({ select } as never);
  return { select, eq };
}

function mockRpc(data: unknown, error: unknown = null) {
  vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data, error } as never);
}

/**
 * The promotion sequence itself lives in the `promote_hackathon_candidate`
 * Postgres function (see the service's own doc comment for why). These
 * tests pin the contract on this side of that boundary: which arguments go
 * in, and how each documented outcome is mapped back.
 */
describe("promoteCandidate", () => {
  afterEach(() => {
    // The module-factory `vi.fn()`s above are not spies, so
    // restoreAllMocks() alone leaves their call history in place and
    // `mock.calls[0]` would still be the previous test's call.
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns not_found without calling the promotion function", async () => {
    mockCandidate(null);

    expect(await promoteCandidate("missing")).toEqual({ outcome: "not_found" });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it("surfaces a candidate read failure as an error", async () => {
    mockCandidate(null, { message: "connection reset" });

    expect(await promoteCandidate("abc")).toEqual({
      outcome: "error",
      message: "connection reset",
    });
  });

  it("passes the submitter's own topics through unchanged", async () => {
    mockCandidate({ name: "Some Blockchain Hackathon", topics: ["AI"] });
    mockRpc({ outcome: "promoted", hackathon_id: "h-1" });

    expect(await promoteCandidate("c-1")).toEqual({
      outcome: "promoted",
      hackathonId: "h-1",
    });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "promote_hackathon_candidate",
      { p_candidate_id: "c-1", p_topics: ["AI"] },
    );
  });

  it("falls back to extracting topics from the name when the candidate has none", async () => {
    mockCandidate({ name: "Blockchain & Web3 Builders Hackathon", topics: [] });
    mockRpc({ outcome: "promoted", hackathon_id: "h-2" });

    await promoteCandidate("c-2");

    const args = vi.mocked(supabaseAdmin.rpc).mock.calls[0][1] as unknown as {
      p_topics: string[];
    };
    expect(args.p_topics).toEqual(expect.arrayContaining(["Crypto", "Web3"]));
  });

  // The case that was broken before this went through the database
  // function: an event already stored under an equivalent-but-different URL
  // (lu.ma vs luma.com, www., a trailing slash, utm_*) was not recognized,
  // so this returned a raw Postgres uniqueness error instead.
  it("maps a normalized-URL collision to duplicate_url", async () => {
    mockCandidate({ name: "Dup", topics: ["AI"] });
    mockRpc({ outcome: "duplicate_url", existing_hackathon_id: "h-existing" });

    expect(await promoteCandidate("c-3")).toEqual({
      outcome: "duplicate_url",
      existingHackathonId: "h-existing",
    });
  });

  it("is idempotent for an already-promoted candidate", async () => {
    mockCandidate({ name: "Again", topics: ["AI"] });
    mockRpc({ outcome: "already_promoted", hackathon_id: "h-4" });

    expect(await promoteCandidate("c-4")).toEqual({
      outcome: "already_promoted",
      hackathonId: "h-4",
    });
  });

  it("surfaces a promotion failure as an error", async () => {
    mockCandidate({ name: "Boom", topics: ["AI"] });
    mockRpc(null, { message: "deadlock detected" });

    expect(await promoteCandidate("c-5")).toEqual({
      outcome: "error",
      message: "deadlock detected",
    });
  });

  it("does not invent a result for an outcome it doesn't recognize", async () => {
    mockCandidate({ name: "Weird", topics: ["AI"] });
    mockRpc({ outcome: "something_new" });

    expect(await promoteCandidate("c-6")).toEqual({
      outcome: "error",
      message: "Unexpected promotion outcome",
    });
  });

  it("does not report success when the function returns no hackathon id", async () => {
    mockCandidate({ name: "Half", topics: ["AI"] });
    mockRpc({ outcome: "promoted" });

    expect(await promoteCandidate("c-7")).toMatchObject({ outcome: "error" });
  });
});
