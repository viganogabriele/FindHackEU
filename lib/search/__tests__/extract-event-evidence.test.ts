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
    expect(evidence?.date_start?.toISOString()).toBe(
      "2026-11-01T09:00:00.000Z",
    );
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

  it("ignores JSON-LD nodes with non-string @type instead of throwing", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">
        {"@type":123,"name":"Bad Type","startDate":"2026-11-01T00:00:00Z"}
      </script>
      <meta property="og:title" content="Fallback After Bad Type" />
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("og-meta");
    expect(evidence?.name).toBe("Fallback After Bad Type");
  });

  it("skips an Event with an invalid start date without poisoning the fallback", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">
        {"@type":"Event","name":"Invalid Date Event","startDate":"not-a-date"}
      </script>
      <meta property="og:title" content="Fallback After Invalid Date" />
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("og-meta");
    expect(evidence?.name).toBe("Fallback After Invalid Date");
  });

  it("drops an invalid end date while retaining a valid Event start date", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">
        {"@type":"Event","name":"Valid Start Event","startDate":"2026-11-01T00:00:00Z","endDate":"not-a-date"}
      </script>
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("jsonld-event");
    expect(evidence?.date_start?.toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(evidence?.date_end).toBeUndefined();
  });

  it("sets has_conflict when the JSON-LD name and og:title share no meaningful words (issue #15)", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">
        {"@type":"Event","name":"Berlin AI Hackathon","startDate":"2026-11-01T00:00:00Z"}
      </script>
      <meta property="og:title" content="Warsaw Robotics Meetup" />
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("jsonld-event");
    expect(evidence?.name).toBe("Berlin AI Hackathon");
    expect(evidence?.has_conflict).toBe(true);
  });

  it("does not set has_conflict when the og:title shares a meaningful word with the JSON-LD name", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">
        {"@type":"Event","name":"Berlin AI Hackathon 2026","startDate":"2026-11-01T00:00:00Z"}
      </script>
      <meta property="og:title" content="Berlin AI Hackathon — Register now" />
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.has_conflict).toBe(false);
  });

  it("does not set has_conflict when the page has no og:title to compare against", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">
        {"@type":"Event","name":"Berlin AI Hackathon","startDate":"2026-11-01T00:00:00Z"}
      </script>
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.has_conflict).toBe(false);
  });

  it("flags different location names even when generic event words overlap", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">
        {"@type":"Event","name":"Berlin AI Hackathon 2026","startDate":"2026-11-01T00:00:00Z"}
      </script>
      <meta property="og:title" content="Paris AI Hackathon 2026" />
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.has_conflict).toBe(true);
  });

  it("reads Open Graph metadata regardless of property/content attribute order", async () => {
    mockFetchHtml(`<html><head>
      <script type="application/ld+json">
        {"@type":"Event","name":"Berlin Hackathon","startDate":"2026-11-01T00:00:00Z"}
      </script>
      <meta content="Berlin Hackathon — register" property="og:title" />
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.has_conflict).toBe(false);
  });

  it("leaves has_conflict false for og-meta and text-fallback tiers (nothing lower-confidence to compare)", async () => {
    mockFetchHtml(`<html><head>
      <meta property="og:title" content="Some Event" />
    </head></html>`);

    const evidence = await extractEventEvidence("https://example.org/event");

    expect(evidence?.extraction_method).toBe("og-meta");
    expect(evidence?.has_conflict).toBe(false);
  });

  it("throws when the page fetch itself fails", async () => {
    mockFetchHtml("", false, 404);

    await expect(
      extractEventEvidence("https://example.org/missing"),
    ).rejects.toThrow(/404/);
  });

  describe("HTML entity decoding in extracted titles (issue #12)", () => {
    it("decodes &#x27;, &amp;, and &quot; in a JSON-LD Event name", async () => {
      mockFetchHtml(`<html><head>
        <script type="application/ld+json">
          {"@type":"Event","name":"HackYeah 2026 \\u2014 Europe&#x27;s &quot;Biggest&quot; Stationary &amp; Online Hackathon","startDate":"2026-11-01T00:00:00Z"}
        </script>
      </head></html>`);

      const evidence = await extractEventEvidence("https://example.org/event");

      expect(evidence?.extraction_method).toBe("jsonld-event");
      expect(evidence?.name).toBe(
        'HackYeah 2026 — Europe\'s "Biggest" Stationary & Online Hackathon',
      );
    });

    it("decodes entities in an og:title fallback", async () => {
      mockFetchHtml(`<html><head>
        <meta property="og:title" content="Rock &amp; Code Hackathon &#8212; Berlin&#x27;s Best" />
      </head></html>`);

      const evidence = await extractEventEvidence("https://example.org/event");

      expect(evidence?.extraction_method).toBe("og-meta");
      expect(evidence?.name).toBe("Rock & Code Hackathon — Berlin's Best");
    });

    it("decodes entities in a bare <title> fallback", async () => {
      mockFetchHtml(
        `<html><head><title>Munich &amp; Friends&#39; Hackathon</title></head></html>`,
      );

      const evidence = await extractEventEvidence("https://example.org/event");

      expect(evidence?.extraction_method).toBe("text-fallback");
      expect(evidence?.name).toBe("Munich & Friends' Hackathon");
    });

    it("leaves a title with no entities unchanged", async () => {
      mockFetchHtml(`<html><head>
        <meta property="og:title" content="Plain Hackathon Title" />
      </head></html>`);

      const evidence = await extractEventEvidence("https://example.org/event");

      expect(evidence?.name).toBe("Plain Hackathon Title");
    });
  });
});
