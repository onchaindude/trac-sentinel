import { logger } from './logger.js';

/** Retry a promise-returning fn up to `attempts` times with exponential backoff.
 *  Only retries on transient errors (network / timeout / 5xx). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 2, label = 'request' }: { attempts?: number; label?: string } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const status  = (err as { response?: { status?: number } })?.response?.status;
      const isRetryable =
        !status ||                    // network error / timeout (no HTTP response)
        status === 429 ||             // rate limited
        status >= 500;                // server error

      if (!isRetryable || i === attempts - 1) throw err;

      const delay = 500 * (i + 1);   // 500ms, 1000ms …
      logger.warn({ label, attempt: i + 1, status, delay }, 'Retrying after error');
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
