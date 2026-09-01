import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hackathon } from "@/types/hackathon";

const { supabaseFrom } = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: supabaseFrom },
}));

import { ReadmeUpdater } from "../readme-updater";

interface RecordedCall {
  method: string;
  args: unknown[];
}

function makeHackathon(overrides: Partial<Hackathon>): Hackathon {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Test Hackathon",
    city: "Berlin",
    country_code: "DE",
    latitude: null,
    longitude: null,
    location_type: "physical",
    venue: null,
    date_start: "2099-01-01T09:00:00.000Z",
    date_end: null,
    topics: [],
    notes: null,
    preview_image_url: null,
    url: "https://example.org/hackathon",
    source: "test",
    status: "upcoming",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    notified: false,
    is_new: false,
    archived_at: null,
    archived_reason: null,
    moderation_state: "approved",
    manually_edited_at: null,
    ...overrides,
  };
}

function createFilteringQueryBuilderMock(rows: Hackathon[]) {
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
          (row) => row[column as keyof Hackathon] === value,
        );
      }

      return builder;
    };

  for (const method of ["select", "eq", "is", "order", "limit"]) {
    builder[method] = chainable(method);
  }

  builder.range = (...args: unknown[]) => {
    calls.push({ method: "range", args });
    return Promise.resolve({ data: matchingRows, error: null });
  };

  builder.then = (
    resolve: (value: { data: Hackathon[]; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve({ data: matchingRows, error: null }).then(resolve, reject);

  return { builder, calls };
}

describe("ReadmeUpdater", () => {
  beforeEach(() => {
    supabaseFrom.mockReset();
  });

  it("excludes pending and rejected hackathons from both README tables", async () => {
    const rows = [
      makeHackathon({
        id: "approved-upcoming",
        name: "Approved Upcoming Hackathon",
        status: "upcoming",
        moderation_state: "approved",
      }),
      makeHackathon({
        id: "pending-upcoming",
        name: "Pending Upcoming Hackathon",
        status: "upcoming",
        moderation_state: "pending",
      }),
      makeHackathon({
        id: "rejected-upcoming",
        name: "Rejected Upcoming Hackathon",
        status: "upcoming",
        moderation_state: "rejected",
      }),
      makeHackathon({
        id: "approved-past",
        name: "Approved Past Hackathon",
        status: "past",
        moderation_state: "approved",
        date_start: "2020-01-01T09:00:00.000Z",
      }),
      makeHackathon({
        id: "pending-past",
        name: "Pending Past Hackathon",
        status: "past",
        moderation_state: "pending",
        date_start: "2020-01-01T09:00:00.000Z",
      }),
      makeHackathon({
        id: "rejected-past",
        name: "Rejected Past Hackathon",
        status: "past",
        moderation_state: "rejected",
        date_start: "2020-01-01T09:00:00.000Z",
      }),
    ];
    const upcoming = createFilteringQueryBuilderMock(rows);
    const past = createFilteringQueryBuilderMock(rows);
    supabaseFrom
      .mockReturnValueOnce(upcoming.builder)
      .mockReturnValueOnce(past.builder);

    const content = await new ReadmeUpdater().generateReadmeContent();

    expect(content).toContain("Approved Upcoming Hackathon");
    expect(content).toContain("Approved Past Hackathon");
    expect(content).not.toContain("Pending Upcoming Hackathon");
    expect(content).not.toContain("Rejected Upcoming Hackathon");
    expect(content).not.toContain("Pending Past Hackathon");
    expect(content).not.toContain("Rejected Past Hackathon");
    expect(
      [...upcoming.calls, ...past.calls].filter(
        (call) => call.method === "eq" && call.args[0] === "moderation_state",
      ),
    ).toHaveLength(2);
  });
});
