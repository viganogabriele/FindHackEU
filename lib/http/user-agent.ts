/**
 * Shared browser `User-Agent` for the listing surfaces this project scrapes.
 *
 * Several sources reject requests that carry an obviously non-browser (or
 * truncated) UA. Devpost's listing API is the concrete case that made this
 * a shared constant rather than a per-parser literal: it answers a bare
 * `"Mozilla/5.0"` with HTTP 403 while returning a normal 200 for a full
 * browser UA (verified live, 2026-09-02) - and because 403 is not a
 * retryable status (see lib/http/fetch-with-retry.ts), that surfaced as a
 * hard `status: "failed"` for the whole provider on every run.
 *
 * MLH, ETHGlobal and Eventbrite already sent exactly this string as three
 * separate copies; they now share this one so a future adjustment doesn't
 * have to be repeated per parser and can't drift between them.
 *
 * Luma and Devfolio deliberately keep their own headers: both are verified
 * working with what they send today, and Luma's endpoint in particular is
 * an unauthenticated internal API where changing request fingerprinting
 * without a reason is a needless risk.
 */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
