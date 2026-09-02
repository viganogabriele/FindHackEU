// Next.js client instrumentation:
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client

type SentryModule = typeof import("@sentry/nextjs");

let sentry: SentryModule | null = null;

/**
 * `@sentry/nextjs`'s browser SDK is ~130 KB gzipped - measured on the live
 * deployment, roughly a quarter of the whole initial JS payload. It used to
 * be imported statically here, so every visitor downloaded and parsed all of
 * it before the page could become interactive.
 *
 * That cost was being paid for nothing: `NEXT_PUBLIC_SENTRY_DSN` is not set
 * on the deployment, so `init()` ran with `enabled: false` and the SDK did
 * literally no work. Verified against the shipped bundles - no DSN appears
 * in any of them.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so with no DSN this
 * branch is statically dead and the import is dropped from the build
 * entirely. With a DSN it becomes its own lazily-fetched chunk, which keeps
 * error reporting off the critical rendering path either way - the project
 * only asks Sentry for error capture (no tracing, no replay, no PII), and
 * that does not need to block first paint.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@sentry/nextjs").then((module) => {
    sentry = module;
    module.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      enabled: true,
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });
}

/**
 * Next reads this export statically, so it cannot itself be behind the
 * dynamic import - it forwards once the SDK has loaded, and is a no-op
 * before that (and always, when no DSN is configured).
 */
export function onRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
) {
  sentry?.captureRouterTransitionStart(...args);
}
