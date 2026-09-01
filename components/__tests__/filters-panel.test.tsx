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
  it("removes the include-other-languages filter when its chip is dismissed", () => {
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

    const languageSwitch = screen.getByRole("switch", {
      name: /include hackathons not in/i,
    });
    fireEvent.click(languageSwitch);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    const removeLanguageFilter = screen.getByRole("button", {
      name: /remove include hackathons not in english filter/i,
    });
    fireEvent.click(removeLanguageFilter);

    expect(languageSwitch.getAttribute("aria-checked")).toBe("false");
    expect(
      screen.queryByRole("button", {
        name: /remove include hackathons not in english filter/i,
      }),
    ).toBeNull();
  });
});
