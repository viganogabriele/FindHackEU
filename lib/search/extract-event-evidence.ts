import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

export interface EventEvidence {
  name: string;
  date_start?: Date;
  date_end?: Date;
  city?: string;
  country_code?: string;
  extraction_method: "jsonld-event" | "og-meta" | "text-fallback";
  raw_snippet: string;
}

interface JsonLdEvent {
  "@type"?: string | string[];
  name?: string;
  startDate?: string;
  endDate?: string;
  location?: {
    "@type"?: string;
    name?: string;
    address?:
      | string
      | {
          addressLocality?: string;
          addressCountry?: string | { name?: string };
        };
  };
}

function isEventType(type: string | string[] | undefined): boolean {
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => t.toLowerCase() === "event");
}

/**
 * Walks a parsed JSON-LD document looking for the first node with
 * `"@type": "Event"` (or an array of types including "Event"), including
 * one level of `@graph` nesting (a common pattern for pages that embed
 * several structured-data types on one page).
 */
function findEventNode(data: unknown): JsonLdEvent | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findEventNode(item);
      if (found) return found;
    }
    return null;
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if (isEventType(obj["@type"] as string | string[] | undefined)) {
      return obj as JsonLdEvent;
    }

    if (obj["@graph"]) {
      return findEventNode(obj["@graph"]);
    }
  }

  return null;
}

function extractJsonLdEvent(html: string): EventEvidence | null {
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }

    const event = findEventNode(parsed);
    if (!event || !event.name || !event.startDate) {
      continue;
    }

    const address = event.location?.address;
    let city: string | undefined;
    let countryName: string | undefined;

    if (typeof address === "string") {
      // Free-text address - leave city/country undetermined here; the
      // caller runs this through the same europeanCountries heuristics
      // every other parser uses.
    } else if (address) {
      city = address.addressLocality;
      countryName =
        typeof address.addressCountry === "string"
          ? address.addressCountry
          : address.addressCountry?.name;
    }

    return {
      name: event.name,
      date_start: new Date(event.startDate),
      date_end: event.endDate ? new Date(event.endDate) : undefined,
      city,
      country_code: countryName,
      extraction_method: "jsonld-event",
      raw_snippet: match[1].slice(0, 2000),
    };
  }

  return null;
}

function extractOgMeta(html: string): EventEvidence | null {
  const titleMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i,
  );
  const descriptionMatch = html.match(
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i,
  );

  if (!titleMatch) {
    return null;
  }

  const name = titleMatch[1].trim();
  const description = descriptionMatch?.[1]?.trim();

  return {
    name,
    extraction_method: "og-meta",
    raw_snippet: [name, description].filter(Boolean).join(" — "),
  };
}

function extractTitleFallback(html: string): EventEvidence | null {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

  if (!titleMatch || !titleMatch[1].trim()) {
    return null;
  }

  const name = titleMatch[1].trim();

  return {
    name,
    extraction_method: "text-fallback",
    raw_snippet: name,
  };
}

/**
 * Fetches `url` and extracts the best available evidence that it's a real
 * event page, in the preference order documented in
 * docs/discovery-research.md: JSON-LD `Event` structured data first, an
 * Open Graph title/description next, and the bare `<title>` as a last,
 * lowest-confidence resort. Returns `null` (not a thrown error) if the
 * page fetches but none of the three extraction methods find anything -
 * that's a legitimate "this probably isn't an event page" outcome, not a
 * failure of the fetch itself.
 */
export async function extractEventEvidence(
  url: string,
): Promise<EventEvidence | null> {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; HackTrackBot/1.0)",
      },
    },
    { retries: 1, timeoutMs: 8000 },
  );

  if (!response.ok) {
    throw new Error(`Candidate page fetch HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();

  return (
    extractJsonLdEvent(html) ??
    extractOgMeta(html) ??
    extractTitleFallback(html)
  );
}
