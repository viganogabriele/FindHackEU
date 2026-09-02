import type { ThemeState, ThemeStyles } from "@/types/theme";

// Converte camelCase in kebab-case per le variabili CSS
const camelToKebab = (str: string): string =>
  str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// Applica le variabili del tema all'elemento HTML
export const applyThemeToElement = (
  themeState: ThemeState,
  element: HTMLElement,
): void => {
  const styles = themeState.styles[themeState.currentMode];

  // Applica ogni variabile CSS
  Object.entries(styles).forEach(([key, value]) => {
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
