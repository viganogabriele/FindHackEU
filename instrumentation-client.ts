import * as Sentry from "@sentry/nextjs";

// Next.js client instrumentation: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
