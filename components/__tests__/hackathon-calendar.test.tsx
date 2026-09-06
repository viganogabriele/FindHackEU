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
        <HackathonCalendar hackathons={HACKATHONS} onSelectDay={() => {}} />
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
        <HackathonCalendar hackathons={HACKATHONS} onSelectDay={() => {}} />
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
   * A day cell has no room to render a full event list itself - clicking it
   * (desktop grid or mobile agenda) hands the day up to the caller, which is
   * responsible for filtering to it and switching to a view that can show
   * it (see app/page.tsx).
   */
  it("reports the clicked day's local midnight Date on both the desktop grid and the mobile agenda", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));

    const onSelectDay = vi.fn();
    render(
      <TranslationProvider>
        <HackathonCalendar hackathons={HACKATHONS} onSelectDay={onSelectDay} />
      </TranslationProvider>,
    );

    // The mobile agenda's day button carries no aria-label - its accessible
    // name comes from its visible text, in the short "Thu 10 Sept" format.
    fireEvent.click(screen.getByRole("button", { name: /Thu 10 Sept/ }));

    // The desktop grid's day button is given an explicit aria-label in the
    // longer "Thursday 10 September" format.
    fireEvent.click(
      screen.getByRole("button", { name: /Thursday 10 September/ }),
    );

    expect(onSelectDay).toHaveBeenCalledTimes(2);
    for (const call of onSelectDay.mock.calls) {
      const day = call[0] as Date;
      expect(day.getFullYear()).toBe(2026);
      expect(day.getMonth()).toBe(8); // September, 0-indexed
      expect(day.getDate()).toBe(10);
      expect(day.getHours()).toBe(0);
    }
  });
});
