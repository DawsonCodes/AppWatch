/** Networking helpers for the update checker: timeouts, bounded retries, politeness delays. */

export const USER_AGENT = 'AppWatch/1.0 (+https://github.com/DawsonCodes/AppWatch)';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
  }
}

/** Race a promise against a timeout. The underlying work is not cancelable in all cases. */
export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  label?: string;
  log?: (message: string) => void;
}

/** Run `fn`, retrying on failure with exponential backoff. Total attempts = retries + 1. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 1000, label = 'request', log } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt;
        log?.(
          `${label}: attempt ${attempt + 1} failed (${errorMessage(error)}), retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** GET a URL and parse the response as JSON, with a hard timeout and UA header. */
export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const { timeoutMs = 15_000, fetchFn = fetch } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`GET ${new URL(url).host}`, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
