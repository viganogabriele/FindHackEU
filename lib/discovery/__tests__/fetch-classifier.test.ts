import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyAndFetchPage } from "@/lib/discovery/fetch-classifier";
import { createRobotsCache } from "@/lib/discovery/robots-checker";

function mockFetchSequence(
  responses: Array<{
    ok?: boolean;
    status?: number;
    text?: string;
    throws?: unknown;
  }>,
) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      // First call for any new host is always the robots.txt fetch.
      if (url.endsWith("/robots.txt")) {
        return { ok: true, status: 200, text: async () => "" };
      }
      const response = responses[Math.min(call, responses.length - 1)];
      call++;
      if (response.throws) {
        throw response.throws;
      }
      return {
        ok: response.ok ?? true,
        status: response.status ?? 200,
        text: async () => response.text ?? "",
      };
    }),
  );
}

describe("classifyAndFetchPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns blocked-by-robots without ever fetching the page itself", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.endsWith("/robots.txt")) {
        return {
          ok: true,
          status: 200,
          text: async () => "User-agent: *\nDisallow: /blocked\n",
        };
      }
      throw new Error("should not fetch the page when robots.txt disallows it");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await classifyAndFetchPage(
      "https://example.org/blocked/page",
      createRobotsCache(),
    );

    expect(result).toEqual({ outcome: "blocked-by-robots", evidence: null });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("classifies a non-2xx response as http-error", async () => {
    mockFetchSequence([{ ok: false, status: 404 }]);

    const result = await classifyAndFetchPage(
      "https://example.org/missing",
      createRobotsCache(),
    );

    expect(result).toEqual({ outcome: "http-error", evidence: null });
  });

  it("classifies an AbortError (timeout) distinctly from an http-error", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    mockFetchSequence([{ throws: abortError }]);

    const result = await classifyAndFetchPage(
      "https://example.org/slow",
      createRobotsCache(),
    );

    expect(result).toEqual({ outcome: "timeout", evidence: null });
  });

  it("classifies a script-heavy, nearly-empty-body page as requires-js", async () => {
    const heavyScript = `<script>${"x".repeat(2000)}</script>`;
    mockFetchSequence([
      {
        text: `<html><head>${heavyScript}</head><body><div id="root"></div></body></html>`,
      },
    ]);

    const result = await classifyAndFetchPage(
      "https://example.org/spa",
      createRobotsCache(),
    );

    expect(result).toEqual({ outcome: "requires-js", evidence: null });
  });

  it("returns ok with extracted evidence for a normal server-rendered page", async () => {
    mockFetchSequence([
      {
        text: `<html><head>
          <script type="application/ld+json">
            {"@type":"Event","name":"Berlin Hack","startDate":"2026-11-01T00:00:00Z"}
          </script>
        </head><body><p>${"Lots of real server-rendered text content. ".repeat(10)}</p></body></html>`,
      },
    ]);

    const result = await classifyAndFetchPage(
      "https://example.org/event",
      createRobotsCache(),
    );

    expect(result.outcome).toBe("ok");
    expect(result.evidence?.name).toBe("Berlin Hack");
    expect(result.evidence?.extraction_method).toBe("jsonld-event");
  });
});
