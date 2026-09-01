/**
 * Lightweight, dependency-free language heuristic for hackathon titles.
 * This is a display-filter signal, not a data-integrity concern, so it is
 * deliberately conservative: ambiguous text is never filtered.
 */

type SupportedLocale =
  | "it"
  | "de"
  | "es"
  | "fr"
  | "nl"
  | "pl"
  | "pt"
  | "ro"
  | "sv";

const LANGUAGE_SIGNALS: Record<SupportedLocale, RegExp> = {
  // "de" is also a common French, Spanish, and Portuguese preposition, so
  // it must not be treated as a unique Italian signal.
  it: /\b(?:di|per|che|con|gli|delle|degli)\b/i,
  de: /\b(?:und|der|die|das|für|mit|über)\b|ß/i,
  es: /\b(?:el|los|las|para|con)\b|ñ/i,
  fr: /\b(?:le|la|les|des|avec|pour)\b|[œÿ]/i,
  nl: /\b(?:van|voor|met|een)\b/i,
  pl: /\b(?:dla|oraz|się)\b|[ąćęłńśźż]/i,
  pt: /\b(?:para|com|uma)\b|[ãõ]/i,
  ro: /\b(?:pentru|și)\b|[ășț]/i,
  sv: /\b(?:och|för|med)\b|å/i,
};

const SUPPORTED_LOCALES = Object.keys(LANGUAGE_SIGNALS) as SupportedLocale[];

/**
 * Returns true when `text` appears to be in one specific supported language
 * other than English and `allowedLocale`. English is intentionally not a
 * signal: titles without a reliable foreign-language match always pass.
 */
export function looksLikeForeignLanguage(
  text: string,
  allowedLocale: string,
): boolean {
  if (!text) return false;

  const detectedLocales = SUPPORTED_LOCALES.filter((locale) =>
    LANGUAGE_SIGNALS[locale].test(text),
  );

  if (detectedLocales.length !== 1) return false;

  return detectedLocales[0] !== allowedLocale.toLowerCase().split("-")[0];
}

/** Backwards-compatible English-only variant for existing callers. */
export function looksNonEnglish(text: string): boolean {
  return looksLikeForeignLanguage(text, "en");
}
