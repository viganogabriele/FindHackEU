// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/candidates",
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams("status=pending&reason=no-date"),
}));

import { AdminSearchInput } from "../admin-search-input";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminSearchInput", () => {
  it("updates the URL after typing without a submit button", async () => {
    render(<AdminSearchInput status="pending" query="" />);

    const input = screen.getByRole("searchbox", {
      name: "Search candidates and hackathons",
    });
    fireEvent.change(input, { target: { value: "Berlin" } });

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        "/admin/candidates?status=pending&reason=no-date&q=Berlin",
        { scroll: false },
      );
    });

    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("data-1p-ignore")).toBe("true");
    expect(input.getAttribute("data-lpignore")).toBe("true");
  });
});
