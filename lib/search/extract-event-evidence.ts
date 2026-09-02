import { decode } from "he";
import { fetchPublicUrl } from "@/lib/http/fetch-public-url";

export interface EventEvidence {
  name: string;
  date_start?: Date;
  date_end?: Date;
  city?: string;
  country_code?: string;
  extraction_method: "jsonld-event" | "og-meta" | "text-fallback";
  raw_snippet: string;
  /**
   * True when JSON-LD extraction won (see the tier order below) AND the
   * same page also carries an Open Graph title that clearly refers to
   * something else (issue #15). This never changes which tier's data is
   * returned - JSON-LD still wins - it's purely an extra confidence signal
   * for a human reviewer at /admin/candidates to double-check the page
   * before approving. Always `false` when the winning tier isn't
   * "jsonld-event", since there's nothing lower-confidence left to compare
   * it against on this page.
   */
  has_conflict: boolean;
}

interface JsonLdEvent {
  "@type"?: unknown;
  name?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  location?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEventType(type: unknown): boolean {
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (t) => typeof t === "string" && t.toLowerCase() === "event",
  );
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

  if (isRecord(data)) {
    const obj = data;

    if (isEventType(obj["@type"])) {
      return obj as JsonLdEvent;
    }

    if (obj["@graph"]) {
      return findEventNode(obj["@graph"]);
    }
  }

  return null;
}

type RawEvidence = Omit<EventEvidence, "has_conflict">;

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Decodes HTML entities (named like `&amp;`/`&quot;`/`&#x27;`, and numeric
 * decimal/hex forms) in extracted title/name text (issue #12). Without
 * this, an apostrophe/ampersand/quote in a page's `og:title`, JSON-LD
 * `name`, or bare `<title>` survives into `hackathon_candidates` as the
 * raw escaped entity instead of the actual character.
 */
function decodeEntities(text: string): string {
  return decode(text);
}

function parseValidDate(value: unknown): Date | undefined {
  const text = readNonEmptyString(value);
  if (!text) return undefined;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function extractJsonLdEvent(html: string): RawEvidence | null {
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
    const rawName = readNonEmptyString(event?.name);
    const name = rawName ? decodeEntities(rawName) : undefined;
    const dateStart = parseValidDate(event?.startDate);
    if (!event || !name || !dateStart) {
      continue;
    }

    const location = isRecord(event.location) ? event.location : undefined;
    const address = location?.address;
    let city: string | undefined;
    let countryName: string | undefined;

    if (typeof address === "string") {
      // Free-text address - leave city/country undetermined here; the
      // caller runs this through the same europeanCountries heuristics
      // every other parser uses.
    } else if (isRecord(address)) {
      city = readNonEmptyString(address.addressLocality);
      const addressCountry = address.addressCountry;
      countryName =
        readNonEmptyString(addressCountry) ??
        (isRecord(addressCountry)
          ? readNonEmptyString(addressCountry.name)
          : undefined);
    }

    return {
      name,
      date_start: dateStart,
      date_end: parseValidDate(event.endDate),
      city,
      country_code: countryName,
      extraction_method: "jsonld-event",
      raw_snippet: match[1].slice(0, 2000),
    };
  }

  return null;
}

function readHtmlAttribute(tag: string, attribute: string): string | undefined {
  const match = tag.match(
    new RegExp(
      `\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    ),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function extractMetaContent(
  html: string,
  property: string,
): string | undefined {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const tagProperty =
      readHtmlAttribute(tag, "property") ?? readHtmlAttribute(tag, "name");
    if (tagProperty?.toLowerCase() !== property.toLowerCase()) continue;

    const content = readHtmlAttribute(tag, "content")?.trim();
    if (content) return content;
  }

  return undefined;
}

function extractOgMeta(html: string): RawEvidence | null {
  const rawName = extractMetaContent(html, "og:title");
  const rawDescription = extractMetaContent(html, "og:description");

  if (!rawName) {
    return null;
  }

  const name = decodeEntities(rawName);
  const description = rawDescription ? decodeEntities(rawDescription) : undefined;

  return {
    name,
    extraction_method: "og-meta",
    raw_snippet: [name, description].filter(Boolean).join(" — "),
  };
}

function extractTitleFallback(html: string): RawEvidence | null {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

  if (!titleMatch || !titleMatch[1].trim()) {
    return null;
  }

  const name = decodeEntities(titleMatch[1].trim());

  return {
    name,
    extraction_method: "text-fallback",
    raw_snippet: name,
  };
}

/**
 * Extracts just the raw `og:title` content (if any), independent of the
 * fuller `extractOgMeta` tier - used only to check the JSON-LD tier
 * against a same-page Open Graph title for a conflict (issue #15), even
 * on a page where JSON-LD wins outright and `extractOgMeta` is never
 * reached in the normal tier cascade.
 */
function extractOgTitleRaw(html: string): string | undefined {
  const rawTitle = extractMetaContent(html, "og:title");
  return rawTitle ? decodeEntities(rawTitle) : undefined;
}

/**
 * Reduces free text to the set of its "meaningful" words (length > 2,
 * diacritics/punctuation stripped, lowercased) for a cheap word-overlap
 * comparison - not real NLP, just enough to tell "same event, different
 * casing/wording" apart from "these are two different things".
 */
const GENERIC_EVENT_WORDS = new Set([
  "challenge",
  "competition",
  "conference",
  "contest",
  "event",
  "events",
  "festival",
  "hackathon",
  "hackathons",
  "meetup",
  "summit",
  "workshop",
]);

function meaningfulWords(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 2 &&
          !/^\d{4}$/.test(word) &&
          !GENERIC_EVENT_WORDS.has(word),
      ),
  );
}

/**
 * Heuristic conflict check (issue #15): the JSON-LD event name and a
 * same-page Open Graph title "clearly refer to different things" when the
 * OG title is present, non-empty, and shares no meaningful word with the
 * JSON-LD name. Generic event words and standalone years are ignored so that
 * two different city editions do not look identical merely because both are
 * called a "Hackathon 2026".
 */
function titlesConflict(
  jsonLdName: string,
  ogTitle: string | undefined,
): boolean {
  if (!ogTitle) return false;
  if (jsonLdName.trim().toLowerCase() === ogTitle.toLowerCase()) return false;

  const jsonLdWords = meaningfulWords(jsonLdName);
  const ogWords = meaningfulWords(ogTitle);

  if (jsonLdWords.size === 0 || ogWords.size === 0) return false;

  for (const word of jsonLdWords) {
    if (ogWords.has(word)) return false;
  }

  return true;
}

/**
 * Runs the three-tier extraction cascade against already-fetched HTML -
 * separated from `extractEventEvidence` (which also does the fetch) so
 * `lib/discovery/fetch-classifier.ts` can classify the fetch outcome
 * (issue #16) before deciding whether it's even worth running extraction
 * on the body it got back.
 */
export function extractEvidenceFromHtml(html: string): EventEvidence | null {
  const jsonLdEvidence = extractJsonLdEvent(html);
  if (jsonLdEvidence) {
    return {
      ...jsonLdEvidence,
      has_conflict: titlesConflict(
        jsonLdEvidence.name,
        extractOgTitleRaw(html),
      ),
    };
  }

  const ogEvidence = extractOgMeta(html);
  if (ogEvidence) {
    return { ...ogEvidence, has_conflict: false };
  }

  const fallbackEvidence = extractTitleFallback(html);
  if (fallbackEvidence) {
    return { ...fallbackEvidence, has_conflict: false };
  }

  return null;
}

/**
 * Fetches `url` and returns its raw HTML body, or throws on a non-2xx
 * response / network failure / timeout. Split out from
 * `extractEventEvidence` so `lib/discovery/fetch-classifier.ts` can fetch
 * once and classify the outcome (ok / http-error / timeout / requires-js)
 * before optionally running extraction on the same HTML (issue #16).
 */
export async function fetchPageHtml(url: string): Promise<string> {
  const response = await fetchPublicUrl(
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

  return response.text();
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
  const html = await fetchPageHtml(url);
  return extractEvidenceFromHtml(html);
}
