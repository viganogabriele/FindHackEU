"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

type ErrorFallbackProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export function ErrorFallback({ error, retry }: ErrorFallbackProps) {
  // Next.js error boundaries must be Client Components:
  // https://nextjs.org/docs/app/getting-started/error-handling
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div>
      <h2>Something went wrong</h2>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
