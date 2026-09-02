/**
 * Presentational cleanup for `hackathon_candidates.raw_snippet` (issue #79).
 *
 * `raw_snippet` is populated at extraction time by
 * `lib/search/extract-event-evidence.ts`'s og-meta/text-fallback tiers and can
 * be a noisy blob straight from the scraped page: countdown-timer widgets
 * ("00Days 00Hours 00Minutes 00Seconds"), duplicated title fragments, and
 * mid-word truncation from upstream `.slice()` calls. `raw_snippet` itself is
 * only ever read for display on the `/admin` review card (see
 * `app/admin/page.tsx`'s `CandidateCard`) — nothing else in the
 * codebase reads it back out — so cleanup happens here, purely at render
 * time, rather than mutating what gets stored at extraction time.
 */

const COUNTDOWN_PATTERN =
  /\b\d{1,3}\s*(?:days?|d)\b[\s,:-]*\d{1,3}\s*(?:hours?|hrs?|h)\b[\s,:-]*\d{1,3}\s*(?:minutes?|mins?|m)\b[\s,:-]*\d{1,3}\s*(?:seconds?|secs?|s)\b/gi;

const DEFAULT_MAX_LENGTH = 200;

/**
 * Strips obvious scraped-page noise (countdown-timer widgets, excess
 * whitespace) and truncates to `maxLength` characters at a word boundary,
 * appending a real ellipsis ("…") rather than cutting mid-word.
 *
 * Returns an empty string for empty/whitespace-only input; a snippet already
 * within `maxLength` after cleanup is returned unchanged (no truncation, no
 * appended ellipsis).
 */
export function cleanRawSnippet(
  snippet: string | null | undefined,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string {
  if (!snippet) {
    return "";
  }

  const withoutCountdown = snippet.replace(COUNTDOWN_PATTERN, " ");
  const collapsed = withoutCountdown.replace(/\s+/g, " ").trim();

  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  const truncated = collapsed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const wordBoundary =
    lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;

  return `${wordBoundary.trim()}…`;
}
