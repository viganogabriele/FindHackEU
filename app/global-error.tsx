"use client";

import { ErrorFallback } from "@/components/error-fallback";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorFallback error={error} retry={unstable_retry} />
      </body>
    </html>
  );
}
