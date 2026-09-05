// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import HackathonCalendar from "@/components/hackathon-calendar";
import { TranslationProvider } from "@/contexts/translation-context";
import type { Hackathon } from "@/types/hackathon";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const HACKATHONS = [
  {
    id: "a",
    name: "Berlin AI Hackathon",
    url: "https://example.org/a",
    city: "Berlin",
    country_code: "DE",
    date_start: "2026-09-10T09:00:00Z",
    date_end: null,
    topics: ["AI"],
    location_type: "physical",
  },
] as unknown as Hackathon[];

describe("HackathonCalendar", () => {
  /**
   * Month navigation moves one month per tap, so a visitor who has browsed
   * ahead needs the shortcut back. It used to be `hidden sm:inline-flex` -
   * present on the layout where holding the arrow is cheap, absent on the
   * one where it is not.
   */
  it("offers the Today shortcut at every screen size", () => {
    render(
      <TranslationProvider>
        <HackathonCalendar hackathons={HACKATHONS} />
      </TranslationProvider>,
    );

    const today = screen.getByRole("button", { name: /today/i });
    expect(today.className).not.toContain("hidden");
  });

  it("returns to the current month after browsing away", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));

    render(
      <TranslationProvider>
        <HackathonCalendar hackathons={HACKATHONS} />
      </TranslationProvider>,
    );

    const heading = () => screen.getByRole("heading", { level: 2 }).textContent;
    expect(heading()).toContain("September");

    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    expect(heading()).toContain("October");

    fireEvent.click(screen.getByRole("button", { name: /today/i }));
    expect(heading()).toContain("September");
  });

  /**
   * The desktop grid's per-day Popover and the mobile agenda's per-day
   * accordion used to share one `selectedKey` state. Radix mounts a
   * Popover's content to a document.body portal whenever its `open` prop
   * is true, regardless of whether the trigger itself is visible - so
   * expanding a day on mobile also flipped `open` to true on the
   * (CSS-hidden, not unmounted) desktop grid's Popover for that same day,
   * rendering a second, floating copy of the day's events pinned to the
   * top-left of the viewport. Found live, 2026-09-05.
   */
  it("keeps the mobile agenda's expanded day independent of the desktop grid's popover", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));

    render(
      <TranslationProvider>
        <HackathonCalendar hackathons={HACKATHONS} />
      </TranslationProvider>,
    );

    // The mobile agenda's day button carries no aria-label - its
    // accessible name comes from its visible text, in the short
    // "Thu 10 Sept" format. The desktop grid's day button is given an
    // explicit aria-label in the longer "Thursday 10 September" format.
    // (The desktop grid cell also always renders a small name preview
    // for the day regardless of popover state, so "Berlin AI Hackathon"
    // legitimately appears more than once - the regression this guards
    // against is the desktop day's *Popover* also opening, not the text
    // occurrence count.)
    fireEvent.click(screen.getByRole("button", { name: /Thu 10 Sept/ }));

    const desktopDayButton = screen.getByRole("button", {
      name: /Thursday 10 September/,
    });
    expect(desktopDayButton.getAttribute("aria-expanded")).toBe("false");
  });
});
