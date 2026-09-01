// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ErrorFallback } from "@/components/error-fallback";

afterEach(cleanup);

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("ErrorFallback", () => {
  it("calls reset when Try again is clicked", () => {
    const reset = vi.fn();

    render(<ErrorFallback error={new Error("boom")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledOnce();
  });
});
