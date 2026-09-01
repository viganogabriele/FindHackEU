// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { CopyLinkButton } from "@/components/copy-link-button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CopyLinkButton", () => {
  it("copies the URL and confirms it to the admin", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyLinkButton url="https://example.org/hack" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://example.org/hack"),
    );
    expect(screen.getByRole("button", { name: "Link copied" })).toBeTruthy();
  });
});
