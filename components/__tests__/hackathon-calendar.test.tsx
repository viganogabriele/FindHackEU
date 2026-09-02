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
});
