import {
  strongHackathonPatterns,
  strongExclusionPatterns,
  competitionPatterns,
  technicalPatterns,
  secondaryPatterns,
} from "@/lib/classification/keywords";

/**
 * Rule-based, multilingual hackathon classifier.
 *
 * This replaces the boolean pattern chain that used to live inline in
 * `LumaParser.isHackathon` (see issue #7). Every signal a title/description
 * matches contributes (or subtracts) points, and the resulting score is
 * compared against two thresholds:
 *
 * - `AUTO_PUBLISH_THRESHOLD`: score at or above this is confidently a
 *   hackathon and gets accepted automatically.
 * - `BORDERLINE_THRESHOLD`: score at or above this (but below the
 *   auto-publish threshold) is "maybe a hackathon" — not confident enough
 *   to auto-publish, but too plausible to silently drop. There is no
 *   candidates/review table yet (that's issue #12/P1-09), so per issue #7's
 *   own fallback instruction, borderline cases are just logged distinctly
 *   for now and still rejected from the feed.
 * - Anything below `BORDERLINE_THRESHOLD` is a confident rejection.
 *
 * A hard exclusion (e.g. "Winners Celebration", "Afterparty") always wins,
 * regardless of any other signal present, because those titles describe an
 * event *about* a hackathon rather than a hackathon itself.
 *
 * Scoring is deliberately simple and additive rather than a black box, so
 * it can be tuned later against real data (issue #38/P3-01) once we have
 * fixtures of real accepted/rejected titles.
 */

// ---------------------------------------------------------------------
// Score weights (points)
// ---------------------------------------------------------------------

const STRONG_EXCLUSION_SCORE = -100;
const STRONG_HACKATHON_SCORE = 100;
const COMPETITION_SIGNAL_SCORE = 30;
const TECHNICAL_SIGNAL_SCORE = 20;
const SECONDARY_SIGNAL_SCORE = 15;
// Cap how many secondary ("build"/"prize"/"team"/"weekend"/...) matches can
// stack, so a title stuffed with buzzwords can't out-score real signals.
const MAX_SECONDARY_MATCHES = 3;

// ---------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------

/** Score at/above which an event is auto-published. */
export const AUTO_PUBLISH_THRESHOLD = 50;
/** Score at/above which a rejected event is logged as "borderline". */
export const BORDERLINE_THRESHOLD = 20;

export type ClassificationDecision = "accepted" | "borderline" | "rejected";

export interface ClassificationResult {
  isHackathon: boolean;
  score: number;
  decision: ClassificationDecision;
  reason: string;
}

/**
 * Normalizes text for pattern matching: NFKD-folds and strips diacritics,
 * lowercases, collapses whitespace. This lets the same ASCII-only regexes
 * match accented variants (e.g. "Perche" matches "perché").
 */
function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Counts DISTINCT matched words across all patterns/texts, not the number
 * of patterns that happen to match. This matters because the multilingual
 * keyword lists (lib/classification/keywords.ts) contain patterns that are
 * equivalent or literally identical across languages (e.g. English
 * `/\bteams?\b/` and German `/\bteam(s)?\b/` both match the word "team"),
 * so a single occurrence of a cognate word must not be double-counted as
 * two separate signals just because two language-specific patterns happen
 * to match it. Without this, a title/description with only one or two
 * genuinely weak secondary signals could reach the auto-publish threshold
 * purely from pattern duplication (found via real Luma data - see issue
 * #7's follow-up).
 */
function countMatches(patterns: RegExp[], texts: string[]): number {
  const matchedWords = new Set<string>();

  for (const pattern of patterns) {
    const globalPattern = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );

    for (const text of texts) {
      for (const match of text.matchAll(globalPattern)) {
        matchedWords.add(match[0].toLowerCase());
      }
    }
  }

  return matchedWords.size;
}

/**
 * Classifies a title/description pair as a hackathon or not, returning a
 * score and a human-readable reason for the decision. Always returns a
 * result — there is no silent path — so callers can log every decision.
 */
export function classifyHackathon(
  title: string,
  description = "",
): ClassificationResult {
  const normalizedTitle = normalizeSearchText(title || "");
  const normalizedDescription = normalizeSearchText(description || "");

  if (!normalizedTitle) {
    return {
      isHackathon: false,
      score: 0,
      decision: "rejected",
      reason: "Empty title.",
    };
  }

  // -----------------------------------------------------------------
  // 1. Strong exclusions — hard reject regardless of any other signal.
  // -----------------------------------------------------------------
  if (
    strongExclusionPatterns.some((pattern) => pattern.test(normalizedTitle))
  ) {
    return {
      isHackathon: false,
      score: STRONG_EXCLUSION_SCORE,
      decision: "rejected",
      reason:
        "Matched a strong exclusion pattern (e.g. winners celebration/afterparty) in the title.",
    };
  }

  // -----------------------------------------------------------------
  // 2. Strong hackathon signals — sufficient on their own.
  // -----------------------------------------------------------------
  if (
    strongHackathonPatterns.some((pattern) => pattern.test(normalizedTitle))
  ) {
    return {
      isHackathon: true,
      score: STRONG_HACKATHON_SCORE,
      decision: "accepted",
      reason:
        'Matched a strong hackathon keyword (e.g. "hackathon"/"buildathon"/a multilingual equivalent) in the title.',
    };
  }

  // -----------------------------------------------------------------
  // 3. Weighted signals.
  // -----------------------------------------------------------------
  const reasons: string[] = [];
  let score = 0;

  const hasCompetitionSignal = competitionPatterns.some((pattern) =>
    pattern.test(normalizedTitle),
  );

  if (hasCompetitionSignal) {
    score += COMPETITION_SIGNAL_SCORE;
    reasons.push("competition/challenge language in title");
  }

  const hasTechnicalSignal = technicalPatterns.some(
    (pattern) =>
      pattern.test(normalizedTitle) || pattern.test(normalizedDescription),
  );

  if (hasTechnicalSignal) {
    score += TECHNICAL_SIGNAL_SCORE;
    reasons.push("technical/developer language in title or description");
  }

  const secondaryMatchCount = Math.min(
    countMatches(secondaryPatterns, [normalizedTitle, normalizedDescription]),
    MAX_SECONDARY_MATCHES,
  );

  if (secondaryMatchCount > 0) {
    score += secondaryMatchCount * SECONDARY_SIGNAL_SCORE;
    reasons.push(
      `${secondaryMatchCount} secondary build/prize/team-style signal(s)`,
    );
  }

  const reasonSummary = reasons.length
    ? `Score ${score} from: ${reasons.join(", ")}.`
    : `Score ${score}: no recognized hackathon signals found.`;

  if (score >= AUTO_PUBLISH_THRESHOLD) {
    return {
      isHackathon: true,
      score,
      decision: "accepted",
      reason: reasonSummary,
    };
  }

  if (score >= BORDERLINE_THRESHOLD) {
    return {
      isHackathon: false,
      score,
      decision: "borderline",
      reason: `${reasonSummary} Below auto-publish threshold (${AUTO_PUBLISH_THRESHOLD}); not confident enough to auto-reject either — logged as borderline (no candidates table yet, see issue #12).`,
    };
  }

  return {
    isHackathon: false,
    score,
    decision: "rejected",
    reason: reasonSummary,
  };
}
