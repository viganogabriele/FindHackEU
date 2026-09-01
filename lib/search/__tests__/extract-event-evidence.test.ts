/**
 * Retires lib/parsers/__tests__/json-ld-gap.test.ts's canary (issue #35
 * "case 6"): that test asserted no code in this repo parsed JSON-LD yet,
 * specifically so it would fail loudly the moment a future issue added
 * that support - see lib/search/extract-event-evidence.ts, added for
 * issue #13/#14/#17's web-search discovery. This file is the "real test
 * replacing it" the canary's own doc comment called for.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractEventEvidence } from "@/lib/search/extract-event-evidence";

function mockFetchHtml(html: string, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      text: async () => html,
    })),
  );
}

describe("extractEventEvidence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("extracts a JSON-LD Event as the highest-confidence evidence", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Event","name":"Berlin AI Hackathon",
         "startDate":"2026-11-01T09:00:00Z","endDate":"2026-11-02T18:00:00Z",
         "location":{"@type":"Place","address":{"addressLocality":"Berlin","addressCountry":"Germany"}}}
      </script>
    </head><body></body></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("jsonld-event");
    expect(evidence?.name).toBe("Berlin AI Hackathon");
    expect(evidence?.date_start?.toISOString()).toBe("2026-11-01T09:00:00.000Z");
    expect(evidence?.city).toBe("Berlin");
    expect(evidence?.country_code).toBe("Germany");
  });

  it("finds an Event node nested under @graph", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[
          {"@type":"WebPage","name":"Home"},
          {"@type":"Event","name":"Graph Nested Hackathon","startDate":"2026-12-01T00:00:00Z"}
        ]}
      </script>
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("jsonld-event");
    expect(evidence?.name).toBe("Graph Nested Hackathon");
  });

  it("falls back to Open Graph meta tags when there is no usable JSON-LD", async () => {
    mockFetchHtml(`<html><head>
      <meta property="og:title" content="Berlin Bio x AI Hackathon 2026" />
      <meta property="og:description" content="February 27-28, 2026" />
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("og-meta");
    expect(evidence?.name).toBe("Berlin Bio x AI Hackathon 2026");
    expect(evidence?.raw_snippet).toContain("February 27-28, 2026");
  });

  it("skips a JSON-LD block with no Event type and falls back to og:meta", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">{"@type":"Organization","name":"Not An Event"}</script>
      <meta property="og:title" content="Real Event Title" />
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("og-meta");
    expect(evidence?.name).toBe("Real Event Title");
  });

  it("falls back to the bare <title> as the lowest-confidence tier", async () => {
    mockFetchHtml(`<html><head><title>Plain Title Only</title></head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("text-fallback");
    expect(evidence?.name).toBe("Plain Title Only");
  });

  it("returns null when no extraction method finds anything", async () => {
    mockFetchHtml(`<html><head></head><body>no useful tags</body></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence).toBeNull();
  });

  it("skips a malformed JSON-LD block instead of throwing", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">{not valid json</script>
      <meta property="og:title" content="Fallback After Bad JSON-LD" />
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("og-meta");
    expect(evidence?.name).toBe("Fallback After Bad JSON-LD");
  });

  it("throws when the page fetch itself fails", async () => {
    mockFetchHtml("", false, 404);

    await expect(
      extractEventEvidence("https://example.org/missing"),
    ).rejects.toThrow(/404/);
  });
});
