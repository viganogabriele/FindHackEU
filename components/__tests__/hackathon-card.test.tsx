// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  HackathonCard,
  type HackathonCardData,
} from "@/components/hackathon-card";
import { TranslationProvider } from "@/contexts/translation-context";

// This repo's vitest.config.mts doesn't enable Jest-style test globals, so
// @testing-library/react's usual auto-cleanup-after-each-test (which relies
// on detecting a global `afterEach`) doesn't kick in - do it explicitly, or
// each test's render leaks into the next one's DOM.
afterEach(cleanup);

/**
 * Covers the shared card extracted from components/hackathon-list.tsx by
 * issue #93. The public site's own rendering is checked against the
 * original inline markup by reading the diff (no visual/browser
 * verification is possible in this environment) - these tests instead lock
 * in the behavioral contract other callers (the admin candidate card) rely
 * on: which parts render, and under what data, so a future edit can't
 * silently break either caller.
 */
function renderCard(hackathon: HackathonCardData, actions?: React.ReactNode) {
  return render(
    <TranslationProvider>
      <HackathonCard hackathon={hackathon} actions={actions} />
    </TranslationProvider>,
  );
}

const base: HackathonCardData = {
  id: "1",
  name: "Test Hackathon",
  date_start: "2026-10-01T00:00:00.000Z",
  date_end: "2026-10-02T00:00:00.000Z",
  city: "Berlin",
  country_code: "DE",
  location_type: "physical",
  topics: ["ai", "web3", "blockchain", "gaming", "mobile"],
};

describe("HackathonCard", () => {
  it("renders the name and a formatted date range when date_start is set", () => {
    renderCard(base);
    expect(screen.getByText("Test Hackathon")).toBeTruthy();
    // Exact formatting is locale/date-fns-context-dependent and covered by
    // formatDateRange itself; just assert the date row rendered at all.
    expect(document.querySelector(".lucide-calendar")).toBeTruthy();
  });

  it("omits the date row entirely when date_start is null (candidate with no recoverable date)", () => {
    renderCard({ ...base, date_start: null });
    expect(document.querySelector(".lucide-calendar")).toBeNull();
  });

  it("renders a formatted city/country location row", () => {
    renderCard(base);
    expect(screen.getByText(/Berlin/)).toBeTruthy();
  });

  it("shows an online badge instead of blank space when no city/country but location_type is online", () => {
    renderCard({
      ...base,
      city: null,
      country_code: null,
      location_type: "online",
    });
    expect(document.querySelector(".lucide-map-pin")).toBeTruthy();
  });

  it("renders nothing for location when no city/country and location_type is tbd", () => {
    renderCard({
      ...base,
      city: null,
      country_code: null,
      location_type: "tbd",
    });
    expect(document.querySelector(".lucide-map-pin")).toBeNull();
  });

  it("caps topic badges at 4 and shows a +N more badge for the rest", () => {
    renderCard(base);
    expect(screen.getByText(/\+1/)).toBeTruthy();
  });

  it("shows the is_new badge only when is_new is true", () => {
    const { rerender } = renderCard({ ...base, is_new: true });
    expect(document.querySelector(".lucide-sparkles")).toBeTruthy();

    rerender(
      <TranslationProvider>
        <HackathonCard hackathon={{ ...base, is_new: false }} />
      </TranslationProvider>,
    );
    expect(document.querySelector(".lucide-sparkles")).toBeNull();
  });

  it("renders the actions slot as the card footer when provided", () => {
    renderCard(base, <button>Approve</button>);
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });

  it("renders no footer when actions is omitted", () => {
    renderCard(base);
    expect(document.querySelector('[data-slot="card-footer"]')).toBeNull();
  });
});
