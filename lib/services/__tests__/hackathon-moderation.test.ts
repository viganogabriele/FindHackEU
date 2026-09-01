import { describe, expect, it, vi } from "vitest";
import { setHackathonModerationState } from "@/lib/services/hackathon-moderation";

/**
 * Issue #102's moderation-state transition mechanism - the counterpart to
 * lib/services/__tests__/archive-hackathon.test.ts for a fully independent
 * concern. A fake Supabase client (mock-based, per the repo's
 * local-Supabase-only constraint) exercises the real branching logic:
 * not-found, already-in-that-state (idempotent no-op), the actual update
 * call's shape, and a fetch/update error surfacing as `"error"`.
 */

function createFakeSupabase(options: {
  existing: { id: string; moderation_state: string } | null;
  fetchError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const updateCalls: unknown[] = [];

  const client = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: options.fetchError ? null : options.existing,
            error: options.fetchError ?? null,
          }),
        }),
      }),
      update: vi.fn().mockImplementation((patch: unknown) => {
        updateCalls.push(patch);
        return {
          eq: vi.fn().mockResolvedValue({
            error: options.updateError ?? null,
          }),
        };
      }),
    }),
  };

  return { client, updateCalls };
}

describe("setHackathonModerationState", () => {
  it("moves a hackathon to a new moderation state", async () => {
    const { client, updateCalls } = createFakeSupabase({
      existing: { id: "h1", moderation_state: "approved" },
    });

    const result = await setHackathonModerationState(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "h1",
      "pending",
    );

    expect(result).toEqual({ outcome: "updated" });
    expect(updateCalls).toEqual([{ moderation_state: "pending" }]);
  });

  it("is idempotent - setting the state it's already in is a no-op", async () => {
    const { client, updateCalls } = createFakeSupabase({
      existing: { id: "h1", moderation_state: "rejected" },
    });

    const result = await setHackathonModerationState(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "h1",
      "rejected",
    );

    expect(result).toEqual({ outcome: "unchanged" });
    expect(updateCalls).toEqual([]);
  });

  it("reports not_found for a nonexistent hackathon", async () => {
    const { client, updateCalls } = createFakeSupabase({ existing: null });

    const result = await setHackathonModerationState(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "missing",
      "approved",
    );

    expect(result).toEqual({ outcome: "not_found" });
    expect(updateCalls).toEqual([]);
  });

  it("surfaces a fetch error", async () => {
    const { client } = createFakeSupabase({
      existing: null,
      fetchError: { message: "boom" },
    });

    const result = await setHackathonModerationState(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "h1",
      "approved",
    );

    expect(result).toEqual({ outcome: "error", message: "boom" });
  });

  it("surfaces an update error", async () => {
    const { client } = createFakeSupabase({
      existing: { id: "h1", moderation_state: "approved" },
      updateError: { message: "update failed" },
    });

    const result = await setHackathonModerationState(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "h1",
      "pending",
    );

    expect(result).toEqual({ outcome: "error", message: "update failed" });
  });
});
