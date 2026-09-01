import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}

/**
 * Free-tier search providers used in fallback order (see issue #18's
 * "budget/rate limit/caching strategy" and CLAUDE.md): Tavily first (1,000
 * credits/month, no card), then SerpAPI (250/month, no card), then Serper
 * (2,500 one-time, no card) as a buffer. Combining several free tiers this
 * way - rather than relying on one - was a deliberate choice discussed
 * with the maintainer, verified against each provider's real free-tier
 * terms on 2026-09-01 (Brave and Google Custom Search were rejected: both
 * dropped their free/new-signup tiers by then).
 */
export class TavilySearchProvider implements SearchProvider {
  readonly name = "tavily";

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const response = await fetchWithRetry(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: maxResults,
        }),
      },
      { retries: 0 },
    );

    if (!response.ok) {
      throw new Error(`Tavily search HTTP ${response.status} for "${query}"`);
    }

    const data = await response.json();
    const results: Array<{ title?: string; url?: string; content?: string }> =
      Array.isArray(data.results) ? data.results : [];

    return results
      .filter((r): r is { title: string; url: string; content?: string } =>
        Boolean(r.title && r.url),
      )
      .map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
  }
}

export class SerpApiSearchProvider implements SearchProvider {
  readonly name = "serpapi";

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      api_key: this.apiKey,
      num: maxResults.toString(),
    });

    const response = await fetchWithRetry(
      `https://serpapi.com/search.json?${params.toString()}`,
      {},
      { retries: 0 },
    );

    if (!response.ok) {
      throw new Error(`SerpAPI search HTTP ${response.status} for "${query}"`);
    }

    const data = await response.json();
    const results: Array<{ title?: string; link?: string; snippet?: string }> =
      Array.isArray(data.organic_results) ? data.organic_results : [];

    return results
      .filter((r): r is { title: string; link: string; snippet?: string } =>
        Boolean(r.title && r.link),
      )
      .map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
  }
}

export class SerperSearchProvider implements SearchProvider {
  readonly name = "serper";

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const response = await fetchWithRetry(
      "https://google.serper.dev/search",
      {
        method: "POST",
        headers: {
          "X-API-KEY": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: maxResults }),
      },
      { retries: 0 },
    );

    if (!response.ok) {
      throw new Error(`Serper search HTTP ${response.status} for "${query}"`);
    }

    const data = await response.json();
    const results: Array<{ title?: string; link?: string; snippet?: string }> =
      Array.isArray(data.organic) ? data.organic : [];

    return results
      .filter((r): r is { title: string; link: string; snippet?: string } =>
        Boolean(r.title && r.link),
      )
      .map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
  }
}

/**
 * Builds the fallback chain from whichever provider API keys are actually
 * configured (each is optional - see .env.example). Order matches the
 * free-tier size, largest first, so the most generous quota is consumed
 * before falling back to a smaller one.
 */
export function buildSearchProviderChain(
  env: NodeJS.ProcessEnv = process.env,
): SearchProvider[] {
  const providers: SearchProvider[] = [];

  if (env.TAVILY_API_KEY) {
    providers.push(new TavilySearchProvider(env.TAVILY_API_KEY));
  }
  if (env.SERPAPI_API_KEY) {
    providers.push(new SerpApiSearchProvider(env.SERPAPI_API_KEY));
  }
  if (env.SERPER_API_KEY) {
    providers.push(new SerperSearchProvider(env.SERPER_API_KEY));
  }

  return providers;
}

/**
 * Runs `query` against each provider in order, returning the first
 * successful (non-throwing) result - a provider that has exhausted its
 * quota or hit a transient error is skipped in favor of the next one,
 * rather than failing the whole search. Throws only if every provider in
 * the chain fails.
 */
export async function searchWithFallback(
  providers: SearchProvider[],
  query: string,
  maxResults: number,
): Promise<{ provider: string; results: SearchResult[] }> {
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      const results = await provider.search(query, maxResults);
      return { provider: provider.name, results };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Search provider "${provider.name}" failed for "${query}": ${message}`,
      );
      errors.push(`[${provider.name}] ${message}`);
    }
  }

  throw new Error(
    `All search providers failed for "${query}": ${errors.join("; ")}`,
  );
}
