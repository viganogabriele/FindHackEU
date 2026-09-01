import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TavilySearchProvider,
  SerpApiSearchProvider,
  SerperSearchProvider,
  buildSearchProviderChain,
  searchWithFallback,
  type SearchProvider,
} from "@/lib/search/search-provider";

describe("search providers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("TavilySearchProvider maps results.{title,url,content}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ title: "T", url: "https://a.example", content: "C" }],
        }),
      })),
    );

    const results = await new TavilySearchProvider("key").search("q", 3);

    expect(results).toEqual([{ title: "T", url: "https://a.example", snippet: "C" }]);
  });

  it("SerpApiSearchProvider maps organic_results.{title,link,snippet}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          organic_results: [{ title: "T", link: "https://b.example", snippet: "S" }],
        }),
      })),
    );

    const results = await new SerpApiSearchProvider("key").search("q", 3);

    expect(results).toEqual([{ title: "T", url: "https://b.example", snippet: "S" }]);
  });

  it("SerperSearchProvider maps organic.{title,link,snippet}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          organic: [{ title: "T", link: "https://c.example", snippet: "S" }],
        }),
      })),
    );

    const results = await new SerperSearchProvider("key").search("q", 3);

    expect(results).toEqual([{ title: "T", url: "https://c.example", snippet: "S" }]);
  });

  it("buildSearchProviderChain includes only providers with a configured key, in size order", () => {
    const chain = buildSearchProviderChain({
      TAVILY_API_KEY: "t",
      SERPER_API_KEY: "s",
    } as unknown as NodeJS.ProcessEnv);

    expect(chain.map((p) => p.name)).toEqual(["tavily", "serper"]);
  });

  it("buildSearchProviderChain returns an empty chain when no keys are configured", () => {
    const chain = buildSearchProviderChain({} as unknown as NodeJS.ProcessEnv);
    expect(chain).toEqual([]);
  });

  it("searchWithFallback falls through to the next provider when the first fails", async () => {
    const failing: SearchProvider = {
      name: "failing",
      search: vi.fn(async () => {
        throw new Error("quota exceeded");
      }),
    };
    const working: SearchProvider = {
      name: "working",
      search: vi.fn(async () => [{ title: "T", url: "https://d.example" }]),
    };

    const outcome = await searchWithFallback([failing, working], "q", 3);

    expect(outcome.provider).toBe("working");
    expect(outcome.results).toHaveLength(1);
  });

  it("searchWithFallback throws only when every provider fails", async () => {
    const allFailing: SearchProvider[] = [
      { name: "a", search: vi.fn(async () => { throw new Error("e1"); }) },
      { name: "b", search: vi.fn(async () => { throw new Error("e2"); }) },
    ];

    await expect(searchWithFallback(allFailing, "q", 3)).rejects.toThrow(
      /All search providers failed/,
    );
  });
});
