/**
 * Shared dedup logic used both by LumaParser's own (single-source) dedup and
 * by app/api/update/route.ts's cross-provider merge step, replacing the
 * three previously-independent weak dedup points described in issue #22:
 *
 * - LumaParser: exact `name + full ISO timestamp` key (case-sensitive).
 * - route.ts cross-provider merge: `lowercased name + calendar day` key.
 * - route.ts DB diff: exact `url` string match.
 *
 * Matching rules (in order):
 * 1. Two events must fall on the same calendar day (UTC date) to be
 *    considered at all — a fuzzy title match alone is never enough.
 * 2. If their URLs normalize to the same key (see lib/dedup/url-normalizer),
 *    they're the same event regardless of title wording.
 * 3. Otherwise, a fuzzy title match (see lib/dedup/fuzzy-matcher) is used as
 *    a secondary signal — but only if it doesn't conflict with a known
 *    location (city/country) on either event, to guard against merging two
 *    genuinely different same-day, similarly-named events (e.g. the same
 *    "AI Hackathon" title recurring in two different cities).
 *
 * Provenance: when two candidates are recognized as duplicates, the
 * first-seen event is kept and the other's URL is recorded on its
 * in-memory-only `alternateUrls` field (see ParsedHackathon). This is NOT
 * persisted to the database — see issue #24 for the deferred schema work.
 */
import type { ParsedHackathon } from "@/lib/parsers/base-parser";
import { normalizeUrl } from "@/lib/dedup/url-normalizer";
import {
  DEFAULT_TITLE_SIMILARITY_THRESHOLD,
  titleSimilarity,
} from "@/lib/dedup/fuzzy-matcher";

export interface DedupeOptions {
  /** Minimum title similarity (0-1) for the fuzzy-match fallback. */
  titleSimilarityThreshold?: number;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.toISOString().split("T")[0] === b.toISOString().split("T")[0];
}

/**
 * True when both events specify a location and it disagrees (different
 * city, or different country). Used to veto an otherwise-passing fuzzy
 * title match — two events with similar titles on the same day but in
 * different, known-different places are not the same event.
 */
function locationsConflict(a: ParsedHackathon, b: ParsedHackathon): boolean {
  const cityConflict =
    !!a.city &&
    !!b.city &&
    a.city.toLowerCase().trim() !== b.city.toLowerCase().trim();

  const countryConflict =
    !!a.country_code &&
    !!b.country_code &&
    a.country_code.toLowerCase() !== b.country_code.toLowerCase();

  return cityConflict || countryConflict;
}

/**
 * Whether `a` and `b` should be treated as the same underlying hackathon.
 */
export function areSameHackathon(
  a: ParsedHackathon,
  b: ParsedHackathon,
  options: DedupeOptions = {},
): boolean {
  if (!sameCalendarDay(a.date_start, b.date_start)) {
    return false;
  }

  if (normalizeUrl(a.url) === normalizeUrl(b.url)) {
    return true;
  }

  const threshold =
    options.titleSimilarityThreshold ?? DEFAULT_TITLE_SIMILARITY_THRESHOLD;

  if (titleSimilarity(a.name, b.name) < threshold) {
    return false;
  }

  // Fuzzy title+date match is only a secondary signal: never merge across
  // a known location conflict.
  return !locationsConflict(a, b);
}

/**
 * Merges duplicate hackathons out of a list, preserving the first-seen
 * event for each group and recording every other recognized duplicate's URL
 * on its `alternateUrls` field (in-memory provenance only).
 */
export function mergeHackathonDuplicates(
  hackathons: ParsedHackathon[],
  options: DedupeOptions = {},
): ParsedHackathon[] {
  const merged: ParsedHackathon[] = [];

  for (const candidate of hackathons) {
    const existing = merged.find((kept) =>
      areSameHackathon(kept, candidate, options),
    );

    if (!existing) {
      merged.push({ ...candidate });
      continue;
    }

    const alternateUrls = new Set(existing.alternateUrls ?? []);

    if (normalizeUrl(existing.url) !== normalizeUrl(candidate.url)) {
      alternateUrls.add(candidate.url);
    }

    for (const url of candidate.alternateUrls ?? []) {
      if (normalizeUrl(url) !== normalizeUrl(existing.url)) {
        alternateUrls.add(url);
      }
    }

    if (alternateUrls.size > 0) {
      existing.alternateUrls = Array.from(alternateUrls);
    }
  }

  return merged;
}
