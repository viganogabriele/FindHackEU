/**
 * Multilingual keyword vocabulary for hackathon classification.
 *
 * Locale coverage matches (a subset of) the languages already supported by
 * the project's UI translations (see `i18n/*.json`): English, Italian,
 * French and German, per issue #7's acceptance criteria ("at minimum").
 *
 * All patterns are matched against text that has already been run through
 * `normalizeSearchText` (NFKD-folded, lowercased, diacritics stripped,
 * whitespace collapsed) — so entries here should be written accordingly
 * (e.g. no accents, no uppercase).
 */

/**
 * Strong signals: on their own, these are sufficient to classify an event
 * as a hackathon. Equivalent terms across languages carry equal weight —
 * a French or German speaker calling something "hackathon" is exactly as
 * strong a signal as an English speaker doing so.
 */
export const strongHackathonPatterns: RegExp[] = [
  // English
  /\bhackathons?\b/,
  /\bhack[\s-]*days?\b/,
  /\bmake[\s-]*a[\s-]*thons?\b/,
  /\bbuild[\s-]*a[\s-]*thons?\b/,
  /\bbuildathons?\b/,
  /\bcodefests?\b/,
  // "hackathon" is a loanword used as-is in Italian, French and German,
  // often combined with a language-specific prefix/suffix.
  /\bhackaton\b/, // common misspelling seen across all locales
  // Italian
  /\bmaratona\s+di\s+programmazione\b/,
  // French
  /\bmarathon\s+de\s+(programmation|codage)\b/,
  // German
  /\bprogrammier(marathon|wettbewerb)\b/,
  /\bki[\s-]*hackathon\b/, // "KI-Hackathon" (KI = Künstliche Intelligenz)
];

/**
 * Competition/challenge vocabulary: on its own too generic (matches things
 * like sports competitions or quizzes), but a strong co-signal when paired
 * with a technical/building signal.
 */
export const competitionPatterns: RegExp[] = [
  // English
  /\bchallenges?\b/,
  /\bcompetitions?\b/,
  /\bcontests?\b/,
  /\bsprints?\b/,
  // Italian
  /\bsfida\b/,
  /\bconcorso\b/,
  /\bcompetizione\b/,
  // French
  /\bdefis?\b/,
  /\bconcours\b/,
  /\bcompetitions?\b/,
  // German
  /\bwettbewerbs?\b/,
  /\bherausforderung(en)?\b/,
];

/**
 * Technical/developer vocabulary: paired with a competition signal, this
 * pushes an event over the "medium" score band.
 */
export const technicalPatterns: RegExp[] = [
  // English
  /\bai\b/,
  /\bartificial intelligence\b/,
  /\bmachine learning\b/,
  /\bml\b/,
  /\bdevelopers?\b/,
  /\bprogramming\b/,
  /\bcoding\b/,
  /\bsoftware\b/,
  /\bweb3\b/,
  /\bblockchain\b/,
  /\bcrypto\b/,
  /\bsolana\b/,
  /\bethereum\b/,
  /\bopen source\b/,
  // Italian
  /\bintelligenza artificiale\b/,
  /\bsviluppator[ei]\b/,
  /\bprogrammazione\b/,
  /\bcodice\b/,
  // French
  /\bintelligence artificielle\b/,
  /\bdeveloppeurs?\b/,
  /\bprogrammation\b/,
  /\bcodage\b/,
  // German
  /\bkunstliche intelligenz\b/,
  /\bentwickler(innen)?\b/,
  /\bprogrammierung\b/,
  /\bsoftwareentwicklung\b/,
];

/**
 * Secondary/build-related vocabulary: small bonus signals. Individually
 * weak (many non-hackathon events mention "team" or "prize"), but useful
 * as tie-breakers for borderline titles like "Builders Weekend".
 */
export const secondaryPatterns: RegExp[] = [
  // English
  /\bbuild\b/,
  /\bbuilders?\b/,
  /\bbuilding\b/,
  /\bprototypes?\b/,
  /\bprototyping\b/,
  /\bprizes?\b/,
  /\bteams?\b/,
  /\bweekend\b/,
  // Italian
  /\bcostruire\b/,
  /\bprototipo\b/,
  /\bpremio\b/,
  /\bsquadra\b/,
  // French
  /\bconstruire\b/,
  /\bprototypes?\b/,
  /\bprix\b/,
  /\bequipes?\b/,
  // German
  /\bbauen\b/,
  /\bprototyp(en)?\b/,
  /\bpreis(e)?\b/,
  /\bteam(s)?\b/,
];

/**
 * Strong exclusion signals: events about an already-concluded hackathon,
 * or purely social gatherings adjacent to one. These hard-reject
 * regardless of how many other signals are present.
 */
export const strongExclusionPatterns: RegExp[] = [
  // English
  /\bwinners?\s+(celebration|party|ceremony)\b/,
  /\bhackathons?\s+(winners?|results?|awards?)\b/,
  /\bafterparty\b/,
  /\bafter\s*party\b/,
  /\bcelebration\s+(party|event)\b/,
  /\bawards?\s+ceremony\b/,
  // Italian
  /\bcerimonia\s+di\s+premiazione\b/,
  /\bfesta\s+dei\s+vincitori\b/,
  // French
  /\bceremonie\s+de\s+remise\s+des\s+prix\b/,
  /\bfete\s+des\s+gagnants\b/,
  // German
  /\bpreisverleihung\b/,
  /\bsiegerfeier\b/,
];
