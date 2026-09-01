import {
  EventEvidence,
  extractEvidenceFromHtml,
  fetchPageHtml,
} from "@/lib/search/extract-event-evidence";
import { isAllowedByRobots, RobotsCache } from "@/lib/discovery/robots-checker";
import { assertPublicHttpUrl } from "@/lib/http/fetch-public-url";

/**
 * Every way a candidate URL can end up (issue #16): `"ok"` is the only
 * outcome that can carry usable extraction evidence - the other four are
 * all "we can't tell if this is a hackathon" outcomes, distinguished so a
 * discovery run can report how much of its URL set was actually usable,
 * instead of lumping every non-result into a single silent skip.
 */
export type FetchOutcome =
  | "ok"
  | "blocked-by-robots"
  | "http-error"
  | "timeout"
  | "requires-js"
  | "invalid-url"
  | "extraction-error";

export interface ClassifiedFetchResult {
  outcome: FetchOutcome;
  evidence: EventEvidence | null;
}

// Heuristic thresholds for the "requires-js" classification below -
// deliberately simple, tuned by eyeballing real SPA vs. real static-page
// HTML rather than derived from any formal metric.
const MIN_RENDERED_TEXT_LENGTH = 200;
const SCRIPT_TO_TEXT_RATIO_THRESHOLD = 2;

/**
 * Heuristic (issue #16): a page whose rendered (tag-stripped) text is very
 * short AND whose <script> content is large relative to that text is
 * probably a JS-rendered SPA shipping little more than a script bundle -
 * this plain-fetch pipeline (like every parser in lib/parsers/*, see
 * CLAUDE.md's "no anti-bot bypass" principle) cannot execute JavaScript,
 * so such a page is unusable rather than a "no evidence found" page. This
 * is intentionally approximate: a short but genuinely static page (e.g. a
 * bare "coming soon" notice) can also trip it, and a large script-heavy
 * page with some server-rendered content will not.
 */
function looksLikeRequiresJs(html: string): boolean {
  const scriptContent = Array.from(
    html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
  )
    .filter(
      ([, attributes]) =>
        !/\btype\s*=\s*["']application\/ld\+json["']/i.test(attributes),
    )
    .map(([, , content]) => content)
    .join("");
  const renderedText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (renderedText.length >= MIN_RENDERED_TEXT_LENGTH) {
    return false;
  }

  return (
    scriptContent.length > renderedText.length * SCRIPT_TO_TEXT_RATIO_THRESHOLD
  );
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted|abort/i.test(error.message))
  );
}

/**
 * The single entry point a discovery run should use to go from a
 * candidate URL to either usable evidence or an honestly classified
 * failure (issue #16): checks robots.txt first (never fetches a
 * disallowed URL at all), then fetches the page, classifying a thrown
 * error as `"timeout"` or `"http-error"`, then runs the `"requires-js"`
 * heuristic on the body before finally attempting extraction.
 */
export async function classifyAndFetchPage(
  url: string,
  robotsCache: RobotsCache,
): Promise<ClassifiedFetchResult> {
  try {
    assertPublicHttpUrl(url);
  } catch {
    return { outcome: "invalid-url", evidence: null };
  }

  const allowed = await isAllowedByRobots(url, robotsCache);
  if (!allowed) {
    return { outcome: "blocked-by-robots", evidence: null };
  }

  let html: string;
  try {
    html = await fetchPageHtml(url);
  } catch (error) {
    return {
      outcome: isTimeoutError(error) ? "timeout" : "http-error",
      evidence: null,
    };
  }

  if (looksLikeRequiresJs(html)) {
    return { outcome: "requires-js", evidence: null };
  }

  try {
    return { outcome: "ok", evidence: extractEvidenceFromHtml(html) };
  } catch (error) {
    console.error(`Could not extract evidence from ${url}:`, error);
    return { outcome: "extraction-error", evidence: null };
  }
}
