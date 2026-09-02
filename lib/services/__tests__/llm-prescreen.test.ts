import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPrescreenPrompt,
  parsePrescreenResponse,
  prescreenCandidate,
  type PrescreenCandidateInput,
  type PrescreenExample,
} from "@/lib/services/llm-prescreen";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function geminiTextResponse(text: string) {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
  };
}

const baseCandidate: PrescreenCandidateInput = {
  name: "Berlin Hackathon 2026",
  raw_snippet: "Join us in Berlin for a 48-hour hackathon focused on AI.",
  extraction_method: "jsonld-event",
  query: "hackathon Germany 2026",
  has_conflict: false,
  blockers: [],
};

describe("buildPrescreenPrompt", () => {
  it("includes the candidate's evidence and blocker labels", () => {
    const prompt = buildPrescreenPrompt(
      {
        ...baseCandidate,
        blockers: [{ code: "no-date", label: "No date" }],
      },
      [],
    );

    expect(prompt).toContain("Berlin Hackathon 2026");
    expect(prompt).toContain("hackathon Germany 2026");
    expect(prompt).toContain("jsonld-event");
    expect(prompt).toContain("No date");
    expect(prompt).toContain("(no prior decisions available yet)");
  });

  it("formats few-shot examples with their reviewer note when present", () => {
    const examples: PrescreenExample[] = [
      {
        name: "Real Event",
        status: "approved",
        reviewer_note: "Verified via organizer site",
      },
      { name: "Spam Listing", status: "rejected", reviewer_note: null },
    ];

    const prompt = buildPrescreenPrompt(baseCandidate, examples);

    expect(prompt).toContain('[APPROVED] "Real Event"');
    expect(prompt).toContain("Verified via organizer site");
    expect(prompt).toContain('[REJECTED] "Spam Listing"');
  });

  it("truncates a very long raw_snippet", () => {
    const longSnippet = "x".repeat(5000);
    const prompt = buildPrescreenPrompt(
      { ...baseCandidate, raw_snippet: longSnippet },
      [],
    );

    expect(prompt).not.toContain("x".repeat(1001));
  });

  it("shows a placeholder when there is no extracted text", () => {
    const prompt = buildPrescreenPrompt(
      { ...baseCandidate, raw_snippet: null },
      [],
    );
    expect(prompt).toContain("(no extracted text)");
  });
});

describe("parsePrescreenResponse", () => {
  it("parses a well-formed JSON response", () => {
    const result = parsePrescreenResponse(
      '{"verdict": "likely-valid", "rationale": "Structured data matches a real event page."}',
    );

    expect(result).toEqual({
      verdict: "likely-valid",
      rationale: "Structured data matches a real event page.",
    });
  });

  it("strips markdown code fences", () => {
    const result = parsePrescreenResponse(
      '```json\n{"verdict": "caution", "rationale": "Vague evidence."}\n```',
    );

    expect(result).toEqual({
      verdict: "caution",
      rationale: "Vague evidence.",
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parsePrescreenResponse("not json at all")).toBeNull();
  });

  it("returns null for an unknown verdict value", () => {
    expect(
      parsePrescreenResponse('{"verdict": "definitely", "rationale": "x"}'),
    ).toBeNull();
  });

  it("returns null when rationale is missing or empty", () => {
    expect(parsePrescreenResponse('{"verdict": "unclear"}')).toBeNull();
    expect(
      parsePrescreenResponse('{"verdict": "unclear", "rationale": "   "}'),
    ).toBeNull();
  });

  it("returns null for a JSON value that isn't an object", () => {
    expect(parsePrescreenResponse("[1,2,3]")).toBeNull();
    expect(parsePrescreenResponse("null")).toBeNull();
  });
});

describe("prescreenCandidate", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null immediately when no API key is configured, without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await prescreenCandidate(baseCandidate, [], {
      apiKey: undefined,
    });

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses a successful Gemini response into a suggestion", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            geminiTextResponse(
              '{"verdict": "likely-valid", "rationale": "Looks like a real event."}',
            ),
          ),
        ),
    );

    const result = await prescreenCandidate(baseCandidate, [], {
      apiKey: "test-key",
    });

    expect(result).toEqual({
      verdict: "likely-valid",
      rationale: "Looks like a real event.",
    });
  });

  it("degrades to null on a non-2xx HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    const result = await prescreenCandidate(baseCandidate, [], {
      apiKey: "test-key",
    });

    expect(result).toBeNull();
  });

  it("degrades to null when fetch throws (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const result = await prescreenCandidate(baseCandidate, [], {
      apiKey: "test-key",
      timeoutMs: 100,
    });

    expect(result).toBeNull();
  });

  it("degrades to null when the response body doesn't parse into a suggestion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(geminiTextResponse("garbage"))),
    );

    const result = await prescreenCandidate(baseCandidate, [], {
      apiKey: "test-key",
    });

    expect(result).toBeNull();
  });

  it("degrades to null when the Gemini payload has no candidates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const result = await prescreenCandidate(baseCandidate, [], {
      apiKey: "test-key",
    });

    expect(result).toBeNull();
  });
});
