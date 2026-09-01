import { describe, expect, it } from "vitest";
import { candidateToHackathonCardData } from "../candidate-card-data";
import type { Database } from "@/types/database";

type CandidateRow = Database["public"]["Tables"]["hackathon_candidates"]["Row"];

function makeCandidate(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: "cand-1",
    name: "Berlin AI Hackathon",
    city: "Berlin",
    country_code: "DE",
    date_start: "2026-11-01T00:00:00.000Z",
    date_end: "2026-11-02T00:00:00.000Z",
    url: "https://example.com/event",
    query: "hackathon germany 2026",
    search_provider: "tavily",
    extraction_method: "jsonld-event",
    raw_snippet: null,
    status: "pending",
    reviewed_at: null,
    reviewer_note: null,
    promoted_at: null,
    promoted_hackathon_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    has_conflict: false,
    source: "web-search",
    topics: ["AI"],
    ...overrides,
  };
}

describe("candidateToHackathonCardData", () => {
  it("maps the fields HackathonCard needs, 1:1 where the columns line up", () => {
    const candidate = makeCandidate();
    const data = candidateToHackathonCardData(candidate);

    expect(data).toEqual({
      id: "cand-1",
      name: "Berlin AI Hackathon",
      url: "https://example.com/event",
      date_start: "2026-11-01T00:00:00.000Z",
      date_end: "2026-11-02T00:00:00.000Z",
      city: "Berlin",
      country_code: "DE",
      location_type: "tbd",
      topics: ["AI"],
    });
  });

  it("passes through a null date_start (a candidate can be discovered with no recoverable date)", () => {
    const candidate = makeCandidate({ date_start: null });
    expect(candidateToHackathonCardData(candidate).date_start).toBeNull();
  });

  it("always sets location_type to tbd, since candidates carry no location_type signal", () => {
    const candidate = makeCandidate({ city: null, country_code: null });
    expect(candidateToHackathonCardData(candidate).location_type).toBe("tbd");
  });

  it("passes through null topics unchanged", () => {
    const candidate = makeCandidate({ topics: null });
    expect(candidateToHackathonCardData(candidate).topics).toBeNull();
  });
});
