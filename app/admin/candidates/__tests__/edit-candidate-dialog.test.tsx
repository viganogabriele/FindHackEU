// @vitest-environment jsdom
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
// @testing-library/react's usual auto-cleanup-after-each-test doesn't kick
// in automatically - see components/__tests__/hackathon-card.test.tsx for
// the same note.
afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../actions", () => ({
  editCandidateFormAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

import { EditCandidateDialog } from "../edit-candidate-dialog";
import { editCandidateFormAction } from "../actions";
import { toast } from "sonner";

type CandidateRow = Database["public"]["Tables"]["hackathon_candidates"]["Row"];

const candidate: CandidateRow = {
  id: "cand-1",
  name: "Hack The Peak",
  city: "Bolzano",
  country_code: "IT",
  date_start: "2026-11-15T00:00:00.000Z",
  date_end: null,
  url: "https://example.org/hack-the-peak",
  query: "hackathon Italy 2026",
  search_provider: "tavily",
  extraction_method: "jsonld-event",
  raw_snippet: null,
  status: "pending",
  reviewed_at: null,
  reviewer_note: null,
  promoted_at: null,
  promoted_hackathon_id: null,
  created_at: "2026-09-01T00:00:00.000Z",
  has_conflict: false,
  source: "web-search",
  topics: ["AI"],
};

describe("EditCandidateDialog", () => {
  it("renders an accessible icon Edit trigger button", () => {
    render(<EditCandidateDialog candidate={candidate} />);
    const trigger = screen.getByRole("button", { name: "Edit candidate" });
    expect(trigger).toBeTruthy();
    expect(trigger.hasAttribute("disabled")).toBe(false);
  });

  it("opens the dialog pre-filled with the candidate's current values", () => {
    render(<EditCandidateDialog candidate={candidate} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit candidate" }));

    expect(screen.getByDisplayValue("Hack The Peak")).toBeTruthy();
    expect(screen.getByDisplayValue("Bolzano")).toBeTruthy();
    expect(screen.getByDisplayValue("IT")).toBeTruthy();
    expect(screen.getByDisplayValue("2026-11-15")).toBeTruthy();
    // The URL is shown but read-only - not a form field.
    expect(screen.getByText("https://example.org/hack-the-peak")).toBeTruthy();
    expect(
      screen.queryByDisplayValue("https://example.org/hack-the-peak"),
    ).toBeNull();
  });

  it("submits through the bound server action on Save", () => {
    render(<EditCandidateDialog candidate={candidate} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit candidate" }));

    const nameInput = screen.getByDisplayValue(
      "Hack The Peak",
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Hack The Peak 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    // `editCandidateFormAction.bind(null, candidate.id)` still calls
    // through to the same mock function under the hood, so this proves
    // the form actually submits via the real action rather than some
    // other handler - the bound `candidateId` itself is covered by
    // lib/services/__tests__/edit-candidate.test.ts and actions.ts's own
    // straightforward `.bind` wiring.
    expect(vi.mocked(editCandidateFormAction)).toHaveBeenCalled();
  });

  it("shows a success toast after the server confirms the save", async () => {
    vi.mocked(editCandidateFormAction).mockResolvedValue({
      outcome: "updated",
    });

    render(<EditCandidateDialog candidate={candidate} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit candidate" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Candidate saved");
    });
  });
});
