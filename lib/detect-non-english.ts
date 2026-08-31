/**
 * Lightweight, dependency-free heuristic to flag a hackathon title as
 * "likely not English" (see issue #54). This is a display-filter signal,
 * not a data-integrity concern, so false positives/negatives are low
 * stakes — it only needs to be reasonably accurate, not perfect.
 *
 * Two independent signals, either of which is enough to flag a title:
 * 1. Diacritics/letters that essentially never appear in English text
 *    (é, ü, ñ, ł, etc.).
 * 2. Common function words from the non-English locales this project's
 *    own UI already supports (i18n/*.json: it, de, es, fr, nl, pl, pt,
 *    ro, sv), matched as whole words.
 *
 * Deliberately conservative: plain English titles that happen to include
 * an English loanword shared with other languages (e.g. "AI", "Hackathon",
 * "Build") never trigger either signal, so the common case is unaffected.
 */

const NON_ENGLISH_LETTERS_PATTERN =
  /[àâäåæçèéêëìíîïñòóôöøùúûüýÿœßăąćčđęěłńňőœřśšťůűźżĄĆĘŁŃŚŹŻ]/;

const NON_ENGLISH_WORDS = [
  // Italian
  "di",
  "de",
  "per",
  "che",
  "con",
  "gli",
  "delle",
  "degli",
  // German
  "und",
  "der",
  "die",
  "das",
  "für",
  "mit",
  "über",
  // French
  "le",
  "la",
  "les",
  "des",
  "avec",
  "pour",
  // Spanish
  "el",
  "los",
  "las",
  "para",
  "con",
  // Dutch
  "van",
  "voor",
  "met",
  "een",
  // Polish
  "dla",
  "oraz",
  "się",
  // Portuguese
  "para",
  "com",
  "uma",
  // Romanian
  "pentru",
  "și",
  // Swedish
  "och",
  "för",
  "med",
];

const NON_ENGLISH_WORDS_PATTERN = new RegExp(
  `\\b(${NON_ENGLISH_WORDS.join("|")})\\b`,
  "i",
);

/**
 * Returns true when `text` looks like it is not primarily written in
 * English, based on the heuristics above. Intended for hackathon
 * titles (short strings) - not validated against long-form prose.
 */
export function looksNonEnglish(text: string): boolean {
  if (!text) {
    return false;
  }

  return (
    NON_ENGLISH_LETTERS_PATTERN.test(text) ||
    NON_ENGLISH_WORDS_PATTERN.test(text)
  );
}
