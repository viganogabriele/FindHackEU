// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyThemeToElement } from "@/lib/theme-utils";
import type { ThemeState, ThemeStyles } from "@/types/theme";

// Regression test for a real bug found while investigating why per-theme
// topic-badge colors never visibly changed between presets: camelToKebab
// (private to theme-utils.ts) left keys ending in a digit - chart1..chart5,
// the only such keys in ThemeStyles - unchanged, so applyThemeToElement set
// the CSS custom property `--chart1` instead of the hyphenated `--chart-1`
// every `.topic-badge-N` rule in app/globals.css actually reads. Theme
// selection therefore never overrode topic-chip colors at all, silently
// falling back to globals.css's hardcoded :root values regardless of the
// active theme preset.
function makeStyles(overrides: Partial<ThemeStyles> = {}): ThemeStyles {
  return {
    background: "#fff",
    foreground: "#000",
    card: "#fff",
    cardForeground: "#000",
    popover: "#fff",
    popoverForeground: "#000",
    primary: "#111",
    primaryForeground: "#fff",
    secondary: "#222",
    secondaryForeground: "#fff",
    muted: "#333",
    mutedForeground: "#fff",
    accent: "#444",
    accentForeground: "#fff",
    destructive: "#f00",
    destructiveForeground: "#fff",
    border: "#555",
    input: "#555",
    ring: "#111",
    chart1: "#aaa111",
    chart2: "#aaa222",
    chart3: "#aaa333",
    chart4: "#aaa444",
    chart5: "#aaa555",
    sidebar: "#fff",
    sidebarForeground: "#000",
    sidebarPrimary: "#111",
    sidebarPrimaryForeground: "#fff",
    sidebarAccent: "#444",
    sidebarAccentForeground: "#fff",
    sidebarBorder: "#555",
    sidebarRing: "#111",
    ...overrides,
  };
}

describe("applyThemeToElement", () => {
  it("sets hyphenated --chart-1..5 custom properties, not --chart1..5", () => {
    const element = document.createElement("html");
    const themeState: ThemeState = {
      styles: { light: makeStyles(), dark: makeStyles() },
      currentMode: "light",
      themeId: "test-theme",
    };

    applyThemeToElement(themeState, element);

    expect(element.style.getPropertyValue("--chart-1")).toBe("#aaa111");
    expect(element.style.getPropertyValue("--chart-2")).toBe("#aaa222");
    expect(element.style.getPropertyValue("--chart-3")).toBe("#aaa333");
    expect(element.style.getPropertyValue("--chart-4")).toBe("#aaa444");
    expect(element.style.getPropertyValue("--chart-5")).toBe("#aaa555");
    // The un-hyphenated form must NOT be set - a stray --chart1 property
    // would be harmless-but-dead weight, and its presence in an earlier
    // version is exactly what masked this bug.
    expect(element.style.getPropertyValue("--chart1")).toBe("");
  });

  it("still hyphenates ordinary camelCase keys with no digits", () => {
    const element = document.createElement("html");
    const themeState: ThemeState = {
      styles: { light: makeStyles(), dark: makeStyles() },
      currentMode: "light",
      themeId: "test-theme",
    };

    applyThemeToElement(themeState, element);

    expect(element.style.getPropertyValue("--card-foreground")).toBe("#000");
    expect(element.style.getPropertyValue("--sidebar-primary-foreground")).toBe(
      "#fff",
    );
  });
});
