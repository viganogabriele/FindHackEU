"use client";

import { useEffect } from "react";

type ErrorFallbackProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Reports to Sentry only when a DSN is configured, and loads the SDK on
 * demand rather than statically.
 *
 * A static `import * as Sentry` here was enough to pull the ~130 KB gzipped
 * browser SDK into the initial bundle for every visitor - this is a Client
 * Component (Next requires error boundaries to be) reachable from the root
 * layout, so it is never code-split away. It also made the guard in
 * `instrumentation-client.ts` pointless on its own.
 *
 * An error boundary is by definition already off the happy path, so paying
 * a network round trip for the SDK at the moment it is needed costs nothing
 * a visitor will notice.
 */
async function reportError(error: Error) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error);
  } catch {
    // Reporting an error must never itself throw inside an error boundary.
  }
}

export function ErrorFallback({ error, reset }: ErrorFallbackProps) {
  // Next.js error boundaries must be Client Components:
  // https://nextjs.org/docs/app/getting-started/error-handling
  useEffect(() => {
    void reportError(error);
  }, [error]);

  return (
    <div>
      <h2>Something went wrong</h2>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
