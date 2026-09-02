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
      name: /show non-.* hackathons/i,
    });
    fireEvent.click(languageSwitch);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    const removeLanguageFilter = screen.getByRole("button", {
      name: /remove show non-english hackathons filter/i,
    });
    fireEvent.click(removeLanguageFilter);

    expect(languageSwitch.getAttribute("aria-checked")).toBe("false");
    expect(
      screen.queryByRole("button", {
        name: /remove show non-english hackathons filter/i,
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
