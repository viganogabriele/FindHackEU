import * as Sentry from "@sentry/nextjs";

// Next.js instrumentation hook: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Next.js invokes this for uncaught errors from route handlers, Server
// Components, Server Actions, and proxy code. Handled errors still call
// Sentry.captureException at their existing catch site where needed.
export const onRequestError = Sentry.captureRequestError;
