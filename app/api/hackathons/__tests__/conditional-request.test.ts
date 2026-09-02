import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The response used to carry `ETag: "hackathons-<status>-<Date.now()>"` - a
 * different value on every response, so no `If-None-Match` could ever match
 * it. A conditional request never got a 304, and every CDN revalidation
 * after `s-maxage` expired re-transferred the whole list rather than
 * confirming it was unchanged.
 *
 * Mocked-Supabase route test, same shape as archived-exclusion.test.ts.
 */
function createQueryBuilderMock(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chainable =
    () =>
    (...args: unknown[]) => {
      void args;
      return builder;
    };

  for (const method of ["select", "eq", "is", "order", "or", "limit"]) {
    builder[method] = chainable();
  }
  builder.range = () => Promise.resolve({ data: rows, error: null });

  return builder;
}

async function loadRoute(rows: unknown[]) {
  vi.resetModules();
  vi.doMock("@/lib/supabase", () => ({
    supabase: { from: vi.fn().mockReturnValue(createQueryBuilderMock(rows)) },
  }));
  return (await import("../route")).GET;
}

const ROWS = [{ id: "a", name: "One", date_start: "2026-10-10T09:00:00Z" }];

describe("GET /api/hackathons - conditional requests", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the same ETag for the same data", async () => {
    const first = await (
      await loadRoute(ROWS)
    )(new Request("https://example.org/api/hackathons"));
    const second = await (
      await loadRoute(ROWS)
    )(new Request("https://example.org/api/hackathons"));

    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("returns a different ETag when the data changes", async () => {
    const before = await (
      await loadRoute(ROWS)
    )(new Request("https://example.org/api/hackathons"));
    const after = await (
      await loadRoute([{ ...ROWS[0], name: "One (renamed)" }])
    )(new Request("https://example.org/api/hackathons"));

    expect(after.headers.get("etag")).not.toBe(before.headers.get("etag"));
  });

  it("answers a matching If-None-Match with an empty 304", async () => {
    const GET = await loadRoute(ROWS);
    const full = await GET(new Request("https://example.org/api/hackathons"));
    const etag = full.headers.get("etag")!;

    const conditional = await GET(
      new Request("https://example.org/api/hackathons", {
        headers: { "If-None-Match": etag },
      }),
    );

    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
    // A 304 still has to carry the freshness headers an intermediary needs.
    expect(conditional.headers.get("cache-control")).toBe(
      full.headers.get("cache-control"),
    );
    expect(conditional.headers.get("etag")).toBe(etag);
  });

  it("serves the full body for a stale If-None-Match", async () => {
    const GET = await loadRoute(ROWS);
    const response = await GET(
      new Request("https://example.org/api/hackathons", {
        headers: { "If-None-Match": '"stale"' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: ROWS });
  });

  // `Vary: Authorization` told shared caches to be careful with a response
  // that is identical for every caller, and neither header was ever read.
  it("does not vary on headers the handler never reads", async () => {
    const GET = await loadRoute(ROWS);
    const response = await GET(
      new Request("https://example.org/api/hackathons"),
    );

    expect(response.headers.get("vary")).toBeNull();
  });
});
