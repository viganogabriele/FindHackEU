/**
 * Fuzzy title matching used as a *secondary* dedup signal (see
 * lib/dedup/dedupe-hackathons.ts and issue #22). It is never sufficient on
 * its own to merge two events — it is only consulted after a same-day check
 * has passed and an exact normalized-URL match has failed, and is still
 * subject to a location-conflict guard on top of it.
 *
 * Implemented as a small hand-rolled Levenshtein distance rather than
 * pulling in a dependency (e.g. `fastest-levenshtein`): hackathon titles are
 * short strings (a handful of words), so the classic O(n*m) DP algorithm is
 * more than fast enough, and avoiding a new dependency keeps this PR (which
 * is already stacked on an unmerged Vitest-baseline PR) from adding
 * lockfile churn for a few dozen lines of well-understood logic.
 */

/** Default minimum similarity (0-1) for two titles to be considered a match. */
export const DEFAULT_TITLE_SIMILARITY_THRESHOLD = 0.82;

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i++) {
    const currentRow = [i + 1];

    for (let j = 0; j < b.length; j++) {
      const insertCost = currentRow[j] + 1;
      const deleteCost = previousRow[j + 1] + 1;
      const substituteCost = previousRow[j] + (a[i] === b[j] ? 0 : 1);

      currentRow.push(Math.min(insertCost, deleteCost, substituteCost));
    }

    previousRow = currentRow;
  }

  return previousRow[b.length];
}

/**
 * Lowercases, strips diacritics, and collapses whitespace so titles that
 * differ only in casing/accents/spacing compare as identical.
 */
function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns a similarity score in [0, 1] between two hackathon titles, based
 * on normalized edit distance (1 = identical after normalization, 0 =
 * completely different).
 */
export function titleSimilarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);

  if (normA === normB) return 1;

  const maxLength = Math.max(normA.length, normB.length);

  if (maxLength === 0) return 1;

  const distance = levenshteinDistance(normA, normB);

  return 1 - distance / maxLength;
}

/**
 * Whether two titles are similar enough to be treated as a fuzzy-match
 * signal, given a configurable threshold (defaults to
 * DEFAULT_TITLE_SIMILARITY_THRESHOLD).
 */
export function areTitlesSimilar(
  a: string,
  b: string,
  threshold: number = DEFAULT_TITLE_SIMILARITY_THRESHOLD,
): boolean {
  return titleSimilarity(a, b) >= threshold;
}
