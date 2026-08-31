/**
 * Shared HTTP helper wrapping native `fetch` with a per-attempt timeout
 * (via `AbortController`) and retry-with-backoff for transient failures.
 *
 * See https://github.com/viganogabriele/HackTrack-EU/issues/30 — parsers
 * previously called `fetch` directly with no timeout and no retry, so a
 * slow or flaky external source could block (or silently drop) an entire
 * pipeline run. Every provider should route its outbound HTTP calls
 * through this helper instead of calling `fetch` directly.
 */

export interface FetchWithRetryOptions {
  /** Abort a single attempt after this many milliseconds. Default: 10000. */
  timeoutMs?: number;
  /** Number of retries after the initial attempt. Default: 2 (3 attempts total). */
  retries?: number;
  /**
   * Base backoff delay in milliseconds. The actual delay before retry
   * attempt N is `backoffMs * N` (linear backoff). Default: 500.
   */
  backoffMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 500;

/**
 * HTTP status codes worth retrying: server errors and rate limiting.
 * 4xx client errors (other than 429) indicate a request that will not
 * succeed on retry, so they are not retried.
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches `url`, enforcing a per-attempt timeout and retrying transient
 * failures (network errors, timeouts, and retryable HTTP statuses) with
 * linear backoff.
 *
 * Resolves with the first successful (2xx) `Response`, or a non-retryable
 * error `Response` (e.g. 404) returned as-is for the caller to inspect.
 * Rejects with the last encountered error once all attempts (the initial
 * attempt plus `retries` retries) are exhausted.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
  }: FetchWithRetryOptions = {},
): Promise<Response> {
  const maxAttempts = retries + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }

      lastError = new Error(
        `Fetch to "${url}" failed with retryable HTTP status ${response.status}`,
      );
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
    }

    const isLastAttempt = attempt === maxAttempts;

    if (!isLastAttempt) {
      await sleep(backoffMs * attempt);
    }
  }

  throw lastError;
}
