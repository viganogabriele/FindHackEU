import type { ThemeState, ThemeStyles } from "@/types/theme";

// Converte camelCase in kebab-case per le variabili CSS.
//
// Bug fix (found while investigating why per-theme topic-badge colors never
// visibly changed between presets, incl. round 2 of the badge redesign):
// keys ending in a digit - only chart1..chart5 in practice, see
// ThemeStyles in types/theme.ts - have no letter-to-uppercase transition
// for the first regex to match, so "chart1" was left as "chart1" and
// applied as the CSS custom property `--chart1`. Every `.topic-badge-N`
// rule in app/globals.css reads `var(--chart-1)` (hyphenated) though, so
// that property was never actually set by theme selection - topic chips
// silently kept rendering globals.css's hardcoded :root fallback colors
// regardless of which theme preset (or preset's own chart palette) was
// active. The second regex inserts the missing hyphen before a trailing
// digit so "chart1" -> "chart-1", matching the CSS that reads it.
const camelToKebab = (str: string): string =>
  str
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .toLowerCase();

// Applica le variabili del tema all'elemento HTML
export const applyThemeToElement = (
  themeState: ThemeState,
  element: HTMLElement,
): void => {
  const styles = themeState.styles[themeState.currentMode];

  // Applica ogni variabile CSS - skip undefined so a preset missing an
  // optional field (e.g. shadow-*/font-* on older presets) doesn't write
  // the literal string "undefined" as the property's value.
  Object.entries(styles).forEach(([key, value]) => {
    if (value === undefined) return;
    element.style.setProperty(`--${camelToKebab(key)}`, value);
  });

  // Gestisce la classe .dark per compatibilità
  if (themeState.currentMode === "dark") {
    element.classList.add("dark");
  } else {
    element.classList.remove("dark");
  }

  // Expose the active preset id as a data attribute so a handful of
  // preset-specific CSS rules (e.g. the "cosmic-glass" theme's translucent,
  // blurred card surfaces in app/globals.css) can be scoped to just that
  // theme instead of a one-off React prop threaded through every component.
  if (themeState.themeId) {
    element.dataset.themeId = themeState.themeId;
  }
};

// Ottiene i colori di preview per un tema (primary e accent)
export const getThemePreviewColors = (styles: ThemeStyles) => ({
  primary: styles.primary,
  accent: styles.accent,
});
