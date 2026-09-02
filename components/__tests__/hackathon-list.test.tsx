// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import HackathonList from "@/components/hackathon-list";
import { FilterProvider } from "@/contexts/filter-context";
import { TranslationProvider } from "@/contexts/translation-context";
import type { Hackathon } from "@/types/hackathon";

afterEach(cleanup);

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
    date_start: "2026-10-10T09:00:00Z",
    date_end: "2026-10-11T17:00:00Z",
    topics: ["AI"],
    location_type: "physical",
  },
  {
    id: "b",
    name: "Paris Web Hackathon",
    url: "https://example.org/b",
    city: "Paris",
    country_code: "FR",
    date_start: "2026-11-01T09:00:00Z",
    date_end: null,
    topics: ["Web3"],
    location_type: "physical",
  },
] as unknown as Hackathon[];

function renderList(filtered: Hackathon[]) {
  return (
    <TranslationProvider>
      <FilterProvider>
        <HackathonList
          upcoming={HACKATHONS}
          past={[]}
          loading={false}
          filteredHackathons={filtered}
        />
      </FilterProvider>
    </TranslationProvider>
  );
}

describe("HackathonList", () => {
  /**
   * `PublicHackathonCard` used to be declared inside `HackathonList`'s
   * render body, which gives it a new function identity on every render.
   * React compares element types by identity, so every card in the list was
   * unmounted and remounted whenever anything re-rendered the list - and
   * typing one character in the search box re-renders it, because the
   * filter context changes.
   *
   * Asserting on the DOM node identity is the point: a re-render must reuse
   * the existing nodes, not build new ones.
   */
  it("reuses the existing card DOM nodes across a re-render", () => {
    const { rerender } = render(renderList(HACKATHONS));

    const before = screen.getByText("Berlin AI Hackathon");

    // A new array with the same items, as a filter change produces.
    rerender(renderList([...HACKATHONS]));

    const after = screen.getByText("Berlin AI Hackathon");
    expect(after).toBe(before);
    expect(after.isConnected).toBe(true);
  });

  it("renders one card per hackathon", () => {
    render(renderList(HACKATHONS));

    expect(screen.getByText("Berlin AI Hackathon")).toBeTruthy();
    expect(screen.getByText("Paris Web Hackathon")).toBeTruthy();
  });
});
