// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  ShareHackathonDropdown,
  FINDHACKEU_URL,
} from "@/components/share-hackathon-dropdown";
import { TranslationProvider } from "@/contexts/translation-context";
import type { Hackathon } from "@/types/hackathon";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const hackathon = {
  id: "1",
  name: "Berlin AI Hackathon",
  url: "https://example.org/berlin-ai-hackathon",
  city: "Berlin",
  country_code: "DE",
  date_start: "2026-10-10T09:00:00Z",
  date_end: "2026-10-11T17:00:00Z",
  topics: ["AI"],
} as Hackathon;

/**
 * Issue: shared content should attribute FindHackEU as the source, not just
 * link out to the external event page - otherwise a reposted share gives
 * FindHackEU no credit at all. Covers the Twitter share path, the one
 * platform whose shared text this component fully controls (LinkedIn/Reddit
 * only receive a title/summary field via their own share-dialog URL, not a
 * full post body).
 */
describe("ShareHackathonDropdown", () => {
  it("includes FindHackEU attribution and the canonical site URL in the Twitter share text", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <TranslationProvider>
        <ShareHackathonDropdown hackathon={hackathon} />
      </TranslationProvider>,
    );

    const trigger = screen.getByRole("button", { name: /share/i });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    fireEvent.click(trigger);
    const twitterItem = await waitFor(() => screen.getByText("Twitter"));
    fireEvent.pointerDown(twitterItem, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(twitterItem, { button: 0, pointerId: 1 });
    fireEvent.click(twitterItem);

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url] = openSpy.mock.calls[0];
    const decoded = decodeURIComponent(String(url));
    expect(decoded).toContain("via FindHackEU");
    expect(decoded).toContain(FINDHACKEU_URL);
    expect(decoded).toContain(hackathon.url);
  });
});
