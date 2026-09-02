// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ErrorFallback } from "@/components/error-fallback";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException }));

afterEach(() => {
  cleanup();
  captureException.mockClear();
  vi.unstubAllEnvs();
});

describe("ErrorFallback", () => {
  it("calls reset when Try again is clicked", () => {
    const reset = vi.fn();

    render(<ErrorFallback error={new Error("boom")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledOnce();
  });

  /**
   * The SDK is ~130 KB gzipped. With no DSN configured it can do nothing
   * useful, so it must not be reached for at all - this is what lets the
   * bundler drop it from the build entirely.
   */
  it("does not reach for Sentry when no DSN is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    render(<ErrorFallback error={new Error("boom")} reset={vi.fn()} />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still reports the error when a DSN is configured", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SENTRY_DSN",
      "https://key@example.ingest.sentry.io/1",
    );
    const error = new Error("boom");

    render(<ErrorFallback error={error} reset={vi.fn()} />);

    await waitFor(() => expect(captureException).toHaveBeenCalledWith(error));
  });
});
