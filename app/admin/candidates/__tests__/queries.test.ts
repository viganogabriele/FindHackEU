import { describe, expect, it, vi } from "vitest";
import {
  candidateSearchOrFilter,
  candidatesByStatusQuery,
  candidatesByStatusCountQuery,
  hackathonsByModerationStateQuery,
  hackathonsByModerationStateCountQuery,
  approvedOrPastHackathonsQuery,
  approvedOrPastHackathonsCountQuery,
  archivedHackathonsQuery,
  archivedHackathonsCountQuery,
} from "../queries";

/**
 * Issue #102: the union-query logic backing /admin/candidates's five tabs.
 * Same mocked-chainable-builder approach as
 * app/api/hackathons/__tests__/{archived,moderation}-exclusion.test.ts -
 * asserts the exact filter/order calls each query function sends to
 * Supabase, rather than only exercising them indirectly by rendering the
 * page (which the repo's local-Supabase-only constraint makes impractical
 * to do against a real database anyway).
 */

interface RecordedCall {
  method: string;
  args: unknown[];
}

function createQueryBuilderMock(rows: unknown[] = [], error: unknown = null) {
  const calls: RecordedCall[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};

  const chainable =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };

  for (const method of [
    "select",
    "eq",
    "is",
    "not",
    "order",
    "or",
    "ilike",
    "limit",
  ]) {
    builder[method] = chainable(method);
  }

  // The real Supabase query builder is itself a thenable - awaiting it
  // (rather than calling a separate terminal method) is how every caller in
  // this repo resolves a query, so the mock must support that too.
  builder.then = (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve({ data: rows, error }).then(resolve, reject);

  return { builder, calls };
}

function createFilteringQueryBuilderMock(rows: Array<Record<string, unknown>>) {
  const calls: RecordedCall[] = [];
  let matchingRows = rows;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};

  const chainable =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });

      if (method === "eq" || method === "is") {
        const [column, value] = args;
        matchingRows = matchingRows.filter(
          (row) => row[column as string] === value,
        );
      }

      return builder;
    };

  for (const method of ["select", "eq", "is", "order", "limit"]) {
    builder[method] = chainable(method);
  }

  builder.then = (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve({ data: matchingRows, error: null }).then(resolve, reject);

  return { builder, calls };
}

function createCountQueryBuilderMock(count: number | null = 0) {
  const calls: RecordedCall[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};

  for (const method of [
    "select",
    "eq",
    "is",
    "not",
    "order",
    "or",
    "ilike",
    "limit",
  ]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }

  builder.then = (
    resolve: (value: {
      data: null;
      count: number | null;
      error: null;
    }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve({ data: null, count, error: null }).then(resolve, reject);

  return { builder, calls };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeClient(builder: unknown): any {
  return { from: vi.fn().mockReturnValue(builder) };
}

describe("candidateSearchOrFilter", () => {
  it("quotes and escapes the query for PostgREST's .or() filter list", () => {
    expect(candidateSearchOrFilter('a"b\\c')).toBe(
      'name.ilike."%a\\"b\\\\c%",city.ilike."%a\\"b\\\\c%",country_code.ilike."%a\\"b\\\\c%",query.ilike."%a\\"b\\\\c%"',
    );
  });
});

describe("candidatesByStatusQuery", () => {
  it("queries hackathon_candidates by status, newest first", async () => {
    const { builder, calls } = createQueryBuilderMock([{ id: "c1" }]);
    const client = fakeClient(builder);

    const result = await candidatesByStatusQuery(client, "pending", "");

    expect(client.from).toHaveBeenCalledWith("hackathon_candidates");
    expect(calls).toContainEqual({ method: "eq", args: ["status", "pending"] });
    expect(calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(calls.some((c) => c.method === "or")).toBe(false);
    expect(result).toEqual({ data: [{ id: "c1" }], error: null });
  });

  it("applies the multi-field search filter when a query is given", async () => {
    const { builder, calls } = createQueryBuilderMock([]);
    const client = fakeClient(builder);

    await candidatesByStatusQuery(client, "rejected", "berlin");

    const orCall = calls.find((c) => c.method === "or");
    expect(orCall?.args[0]).toBe(candidateSearchOrFilter("berlin"));
  });
});

describe("count-only tab queries", () => {
  it("counts pending candidates without fetching or limiting rows", async () => {
    const { builder, calls } = createCountQueryBuilderMock(12);
    const client = fakeClient(builder);

    const result = await candidatesByStatusCountQuery(
      client,
      "pending",
      "berlin",
    );

    expect(calls).toContainEqual({
      method: "select",
      args: ["id", { count: "exact", head: true }],
    });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "pending"] });
    expect(calls.some((call) => call.method === "limit")).toBe(false);
    expect(result).toEqual({ data: null, count: 12, error: null });
  });

  it("counts pending or rejected published hackathons with the same filters", async () => {
    const { builder, calls } = createCountQueryBuilderMock(4);
    const client = fakeClient(builder);

    await hackathonsByModerationStateCountQuery(client, "rejected", "berlin");

    expect(calls).toContainEqual({
      method: "select",
      args: ["id", { count: "exact", head: true }],
    });
    expect(calls).toContainEqual({
      method: "eq",
      args: ["moderation_state", "rejected"],
    });
    expect(calls).toContainEqual({ method: "is", args: ["archived_at", null] });
    expect(calls).toContainEqual({
      method: "ilike",
      args: ["name", "%berlin%"],
    });
    expect(calls.some((call) => call.method === "limit")).toBe(false);
  });

  it("counts the approved/past date split without ordering rows", async () => {
    const { builder, calls } = createCountQueryBuilderMock(8);
    const client = fakeClient(builder);
    const now = new Date("2026-09-01T12:00:00.000Z");

    await approvedOrPastHackathonsCountQuery(client, "past", "", now);

    expect(calls).toContainEqual({
      method: "select",
      args: ["id", { count: "exact", head: true }],
    });
    expect(calls).toContainEqual({
      method: "or",
      args: [
        `status.eq.past,and(status.eq.estimated,date_start.lt.${now.toISOString()})`,
      ],
    });
    expect(calls.some((call) => call.method === "order")).toBe(false);
  });

  it("counts archived hackathons using the archived-only filter", async () => {
    const { builder, calls } = createCountQueryBuilderMock(3);
    const client = fakeClient(builder);

    await archivedHackathonsCountQuery(client, "");

    expect(calls).toContainEqual({
      method: "select",
      args: ["id", { count: "exact", head: true }],
    });
    expect(calls).toContainEqual({
      method: "not",
      args: ["archived_at", "is", null],
    });
    expect(calls.some((call) => call.method === "order")).toBe(false);
  });
});

describe("hackathonsByModerationStateQuery", () => {
  it("queries hackathons by moderation_state, name search only", async () => {
    const { builder, calls } = createQueryBuilderMock([]);
    const client = fakeClient(builder);

    await hackathonsByModerationStateQuery(client, "rejected", "berlin");

    expect(client.from).toHaveBeenCalledWith("hackathons");
    expect(calls).toContainEqual({
      method: "eq",
      args: ["moderation_state", "rejected"],
    });
    expect(calls).toContainEqual({
      method: "ilike",
      args: ["name", "%berlin%"],
    });
    expect(calls.some((c) => c.method === "or")).toBe(false);
  });

  it("omits the name filter when no query is given", async () => {
    const { builder, calls } = createQueryBuilderMock([]);
    const client = fakeClient(builder);

    await hackathonsByModerationStateQuery(client, "pending", "");

    expect(calls.some((c) => c.method === "ilike")).toBe(false);
  });

  it("excludes an archived hackathon from the pending moderation query", async () => {
    const { builder, calls } = createFilteringQueryBuilderMock([
      {
        id: "archived-pending",
        moderation_state: "pending",
        archived_at: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "active-pending",
        moderation_state: "pending",
        archived_at: null,
      },
    ]);
    const client = fakeClient(builder);

    const result = await hackathonsByModerationStateQuery(
      client,
      "pending",
      "",
    );

    expect(calls).toContainEqual({
      method: "is",
      args: ["archived_at", null],
    });
    expect(result).toEqual({
      data: [
        {
          id: "active-pending",
          moderation_state: "pending",
          archived_at: null,
        },
      ],
      error: null,
    });
  });
});

describe("approvedOrPastHackathonsQuery", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");

  it("approved: moderation_state approved, not archived, upcoming or future-estimated", async () => {
    const { builder, calls } = createQueryBuilderMock([]);
    const client = fakeClient(builder);

    await approvedOrPastHackathonsQuery(client, "approved", "", now);

    expect(calls).toContainEqual({
      method: "eq",
      args: ["moderation_state", "approved"],
    });
    expect(calls).toContainEqual({
      method: "is",
      args: ["archived_at", null],
    });
    expect(calls).toContainEqual({
      method: "order",
      args: ["date_start", { ascending: true }],
    });
    expect(calls).toContainEqual({
      method: "or",
      args: [
        `status.eq.upcoming,and(status.eq.estimated,date_start.gte.${now.toISOString()})`,
      ],
    });
  });

  it("past: same approved/not-archived scope, but past or past-dated estimated", async () => {
    const { builder, calls } = createQueryBuilderMock([]);
    const client = fakeClient(builder);

    await approvedOrPastHackathonsQuery(client, "past", "", now);

    expect(calls).toContainEqual({
      method: "eq",
      args: ["moderation_state", "approved"],
    });
    expect(calls).toContainEqual({
      method: "order",
      args: ["date_start", { ascending: false }],
    });
    expect(calls).toContainEqual({
      method: "or",
      args: [
        `status.eq.past,and(status.eq.estimated,date_start.lt.${now.toISOString()})`,
      ],
    });
  });

  it("still applies name search alongside the date-split filter", async () => {
    const { builder, calls } = createQueryBuilderMock([]);
    const client = fakeClient(builder);

    await approvedOrPastHackathonsQuery(client, "approved", "berlin", now);

    expect(calls).toContainEqual({
      method: "ilike",
      args: ["name", "%berlin%"],
    });
    // Both the estimated-date-split .or() and the search .or() must survive
    // as two independent (AND'd) filters, not clobber each other.
    expect(calls.filter((c) => c.method === "or")).toHaveLength(1);
  });
});

describe("archivedHackathonsQuery", () => {
  it("queries only archived hackathons, most-recently-archived first", async () => {
    const { builder, calls } = createQueryBuilderMock([]);
    const client = fakeClient(builder);

    await archivedHackathonsQuery(client, "");

    expect(client.from).toHaveBeenCalledWith("hackathons");
    expect(calls).toContainEqual({
      method: "not",
      args: ["archived_at", "is", null],
    });
    expect(calls).toContainEqual({
      method: "order",
      args: ["archived_at", { ascending: false }],
    });
    // Issue #102: no longer unions in rejected candidates - purely
    // hackathons, no eq("moderation_state", ...) filter at all.
    expect(calls.some((c) => c.method === "eq")).toBe(false);
  });
});
