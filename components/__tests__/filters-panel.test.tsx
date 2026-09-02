// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FiltersPanel } from "@/components/filters-panel";
import { FilterProvider } from "@/contexts/filter-context";
import { TranslationProvider } from "@/contexts/translation-context";

afterEach(cleanup);

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe("FiltersPanel", () => {
  it("removes the hide-non-English filter when its chip is dismissed", () => {
    render(
      <TranslationProvider>
        <FilterProvider>
          <FiltersPanel
            uniqueUpcomingLocations={[]}
            uniquePastLocations={[]}
            uniqueTopics={[]}
          />
        </FilterProvider>
      </TranslationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    // includeNonEnglish defaults to true (opt-out) - toggling it off is what
    // surfaces the "hidden" chip, matching includeOnline's existing pattern.
    const languageSwitch = screen.getByRole("switch", {
      name: /show non-.* hackathons/i,
    });
    expect(languageSwitch.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(languageSwitch);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    const removeLanguageFilter = screen.getByRole("button", {
      name: /remove non-english hackathons hidden filter/i,
    });
    fireEvent.click(removeLanguageFilter);

    expect(languageSwitch.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.queryByRole("button", {
        name: /remove non-english hackathons hidden filter/i,
      }),
    ).toBeNull();
  });

  it("removes the show-online-events filter when its chip is dismissed", () => {
    render(
      <TranslationProvider>
        <FilterProvider>
          <FiltersPanel
            uniqueUpcomingLocations={[]}
            uniquePastLocations={[]}
            uniqueTopics={[]}
          />
        </FilterProvider>
      </TranslationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const onlineSwitch = screen.getByRole("switch", {
      name: /show online events/i,
    });
    expect(onlineSwitch.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(onlineSwitch);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    const removeOnlineFilter = screen.getByRole("button", {
      name: /remove online events hidden filter/i,
    });
    fireEvent.click(removeOnlineFilter);

    expect(onlineSwitch.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.queryByRole("button", {
        name: /remove online events hidden filter/i,
      }),
    ).toBeNull();
  });
});
