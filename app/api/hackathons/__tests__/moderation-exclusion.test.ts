import { describe, expect, it, vi } from "vitest";

/**
 * Issue #102: the public read API must exclude non-'approved'
 * `moderation_state` rows, the same way it already excludes archived rows
 * (see archived-exclusion.test.ts, whose mock-Supabase pattern this test
 * follows exactly) - a 'pending' or 'rejected' hackathon must disappear
 * from the public site immediately once moved to that state.
 */

interface RecordedCall {
  method: string;
  args: unknown[];
}

function createQueryBuilderMock(rows: unknown[]) {
  const calls: RecordedCall[] = [];

  const builder: Record<string, unknown> = {};

  const chainable =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };

  for (const method of ["select", "eq", "is", "order", "or", "limit"]) {
    builder[method] = chainable(method);
  }

  builder.range = (...args: unknown[]) => {
    calls.push({ method: "range", args });
    return Promise.resolve({ data: rows, error: null });
  };

  return { builder, calls };
}

describe("GET /api/hackathons - moderation_state exclusion", () => {
  it("only returns moderation_state = approved when listing upcoming hackathons", async () => {
    const { builder, calls } = createQueryBuilderMock([]);

    vi.doMock("@/lib/supabase", () => ({
      supabase: { from: vi.fn().mockReturnValue(builder) },
    }));

    const { GET } = await import("../route");

    const response = await GET(
      new Request("https://example.org/api/hackathons"),
    );

    expect(response.status).toBe(200);

    const eqCalls = calls.filter((c) => c.method === "eq");
    expect(eqCalls).toContainEqual({
      method: "eq",
      args: ["moderation_state", "approved"],
    });

    // Both exclusion filters (issue #72's archived_at and issue #102's
    // moderation_state) must be present together - neither alone is
    // sufficient to keep a moderated-away-but-not-archived row hidden, or
    // vice versa.
    const isCalls = calls.filter((c) => c.method === "is");
    expect(isCalls).toContainEqual({
      method: "is",
      args: ["archived_at", null],
    });

    vi.doUnmock("@/lib/supabase");
    vi.resetModules();
  });
});
