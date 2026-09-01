// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Database } from "@/types/database";

// This repo's vitest.config.mts doesn't enable Jest-style test globals, so
// @testing-library/react's usual auto-cleanup-after-each-test doesn't kick in
// automatically - see the neighboring candidate dialog test.
afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../../hackathons/actions", () => ({
  editHackathonFormAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

import { EditHackathonDialog } from "../edit-hackathon-dialog";
import { editHackathonFormAction } from "../../hackathons/actions";
import { toast } from "sonner";

type HackathonRow = Database["public"]["Tables"]["hackathons"]["Row"];

const hackathon: HackathonRow = {
  id: "hack-1",
  name: "Hack The Peak",
  city: "Bolzano",
  country_code: "IT",
  latitude: null,
  longitude: null,
  location_type: "physical",
  venue: null,
  date_start: "2026-11-15T00:00:00.000Z",
  date_end: "2026-11-16T00:00:00.000Z",
  topics: ["AI"],
  notes: null,
  url: "https://example.org/hack-the-peak",
  source: "luma",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
  notified: false,
  is_new: false,
  archived_at: null,
  archived_reason: null,
  moderation_state: "approved",
  manually_edited_at: null,
};

describe("EditHackathonDialog", () => {
  it("renders an accessible icon Edit trigger button", () => {
    render(<EditHackathonDialog hackathon={hackathon} />);

    const trigger = screen.getByRole("button", { name: "Edit hackathon" });
    expect(trigger).toBeTruthy();
    expect(trigger.hasAttribute("disabled")).toBe(false);
  });

  it("opens pre-filled with the published hackathon's editable values", () => {
    render(<EditHackathonDialog hackathon={hackathon} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit hackathon" }));

    expect(screen.getByDisplayValue("Hack The Peak")).toBeTruthy();
    expect(screen.getByDisplayValue("Bolzano")).toBeTruthy();
    expect(screen.getByDisplayValue("IT")).toBeTruthy();
    expect(screen.getByDisplayValue("2026-11-15")).toBeTruthy();

    const urlInput = screen.getByDisplayValue(
      "https://example.org/hack-the-peak",
    ) as HTMLInputElement;
    expect(urlInput.disabled).toBe(false);
  });

  it("submits through the bound server action on Save", () => {
    render(<EditHackathonDialog hackathon={hackathon} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit hackathon" }));

    const nameInput = screen.getByDisplayValue(
      "Hack The Peak",
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Hack The Peak 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    // `editHackathonFormAction.bind(null, hackathon.id)` proves that the
    // dialog submits through the server action rather than a client-only
    // handler; the service test covers the persisted patch and validation.
    expect(vi.mocked(editHackathonFormAction)).toHaveBeenCalled();
  });

  it("submits selected topics as hidden form fields and supports clearing them", () => {
    render(<EditHackathonDialog hackathon={hackathon} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit hackathon" }));

    expect(
      document.querySelector('input[name="topics"][value="AI"]'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Web3" }));

    expect(
      document.querySelector('input[name="topics"][value="AI"]'),
    ).toBeNull();
    expect(
      document.querySelector('input[name="topics"][value="Web3"]'),
    ).toBeTruthy();
  });

  it("shows a success toast after the server confirms the save", async () => {
    vi.mocked(editHackathonFormAction).mockResolvedValue({
      outcome: "updated",
    });

    render(<EditHackathonDialog hackathon={hackathon} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit hackathon" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Hackathon saved");
    });
  });

  it("shows one success toast when React StrictMode re-renders the result", async () => {
    vi.mocked(editHackathonFormAction).mockResolvedValue({
      outcome: "updated",
    });

    render(
      <StrictMode>
        <EditHackathonDialog hackathon={hackathon} />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit hackathon" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1);
    });
  });

  it("clears a previous validation error when reopened", async () => {
    vi.mocked(editHackathonFormAction).mockResolvedValue({
      outcome: "error",
      message: "Name is required",
    });

    render(<EditHackathonDialog hackathon={hackathon} />);
    const trigger = screen.getByRole("button", { name: "Edit hackathon" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(screen.getByText("Name is required")).toBeTruthy(),
    );
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByText("Name is required")).toBeNull();
  });
});
