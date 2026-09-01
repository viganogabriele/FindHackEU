import { describe, expect, it, vi } from "vitest";

/**
 * Issue #72: the public read API must exclude archived hackathons
 * (`archived_at is not null`), the same way it already scopes by `status`.
 * This is a mocked-Supabase test (per the repo's local-Supabase-only
 * constraint) that asserts the query builder actually receives an
 * `.is("archived_at", null)` filter, rather than trusting the route's
 * source code alone.
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

  // `range()` is the terminal call fetchAllRows uses - resolve with a
  // short page so the pagination loop stops after one call.
  builder.range = (...args: unknown[]) => {
    calls.push({ method: "range", args });
    return Promise.resolve({ data: rows, error: null });
  };

  return { builder, calls };
}

describe("GET /api/hackathons - archived-row exclusion", () => {
  it("filters archived_at is null when listing upcoming hackathons", async () => {
    const { builder, calls } = createQueryBuilderMock([]);

    vi.doMock("@/lib/supabase", () => ({
      supabase: { from: vi.fn().mockReturnValue(builder) },
    }));

    const { GET } = await import("../route");

    const response = await GET(
      new Request("https://example.org/api/hackathons"),
    );

    expect(response.status).toBe(200);

    const isCalls = calls.filter((c) => c.method === "is");
    expect(isCalls).toContainEqual({
      method: "is",
      args: ["archived_at", null],
    });

    vi.doUnmock("@/lib/supabase");
    vi.resetModules();
  });
});
