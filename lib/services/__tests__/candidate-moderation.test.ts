import { describe, expect, it, vi } from "vitest";
import { moveCandidateToPending } from "@/lib/services/candidate-moderation";

function createFakeSupabase(options: {
  outcome?: "updated" | "unchanged" | "not_found";
  updateError?: { message: string } | null;
}) {
  const client = {
    from: vi.fn().mockReturnValue({}),
    rpc: vi.fn().mockResolvedValue({
      data: options.updateError ? null : (options.outcome ?? "not_found"),
      error: options.updateError ?? null,
    }),
  };

  return { client };
}

describe("moveCandidateToPending", () => {
  it("resets a rejected candidate to the pending review state", async () => {
    const { client } = createFakeSupabase({ outcome: "updated" });

    const result = await moveCandidateToPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "candidate-1",
    );

    expect(result).toEqual({ outcome: "updated" });
  });

  it("reports not_found when no rejected row can be updated", async () => {
    const { client } = createFakeSupabase({ outcome: "not_found" });

    const result = await moveCandidateToPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "missing",
    );

    expect(result).toEqual({ outcome: "not_found" });
  });

  it("reports unchanged when the candidate is no longer rejected", async () => {
    const { client } = createFakeSupabase({ outcome: "unchanged" });

    const result = await moveCandidateToPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "candidate-1",
    );

    expect(result).toEqual({ outcome: "unchanged" });
  });

  it("surfaces an update error", async () => {
    const { client } = createFakeSupabase({
      updateError: { message: "update failed" },
    });

    const result = await moveCandidateToPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "candidate-1",
    );

    expect(result).toEqual({ outcome: "error", message: "update failed" });
  });
});
