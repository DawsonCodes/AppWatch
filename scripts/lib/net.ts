/** Networking helpers for the update checker: timeouts, bounded retries, politeness delays. */

export const USER_AGENT = 'AppWatch/1.0 (+https://github.com/DawsonCodes/AppWatch)';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a function that resolves once at least `minIntervalMs` has passed
 * since the previous call resolved. Providers use it to space out requests
 * to a store, so politeness is enforced per store rather than per app.
 */
export function createThrottle(
  minIntervalMs: number,
  wait: (ms: number) => Promise<void> = sleep,
  clock: () => number = Date.now,
): () => Promise<void> {
  let last = Number.NEGATIVE_INFINITY;
  let queue: Promise<void> = Promise.resolve();
  return () => {
    const turn = queue.then(async () => {
      const remaining = last + minIntervalMs - clock();
      if (remaining > 0) await wait(remaining);
      last = clock();
    });
    queue = turn.catch(() => {});
    return turn;
  };
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
  /** Return false for errors that retrying can't fix (e.g. 404, out of quota). */
  shouldRetry?: (error: unknown) => boolean;
}

/** Run `fn`, retrying on failure with exponential backoff. Total attempts = retries + 1. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 1000, label = 'request', log, shouldRetry } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (shouldRetry && !shouldRetry(error)) break;
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
  /** Extra request headers (e.g. an API token or version header). */
  headers?: Record<string, string>;
}

/** An HTTP error with its status, so callers can tell "not found" from an outage. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly host: string,
    readonly headers: Headers | null = null,
  ) {
    super(`HTTP ${status} from ${host}`);
  }
}

async function request(url: string, accept: string, options: FetchJsonOptions): Promise<Response> {
  const { timeoutMs = 15_000, fetchFn = fetch, headers = {} } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      headers: { 'user-agent': USER_AGENT, accept, ...headers },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new HttpError(response.status, new URL(url).host, response.headers ?? null);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`GET ${new URL(url).host}`, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** GET a URL and parse the response as JSON, with a hard timeout and UA header. */
export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const response = await request(url, options.headers?.accept ?? 'application/json', options);
  return (await response.json()) as unknown;
}

/** GET a URL as text, with the same timeout and headers as fetchJson. */
export async function fetchText(url: string, options: FetchJsonOptions = {}): Promise<string> {
  const response = await request(url, options.headers?.accept ?? 'text/plain, */*', options);
  return response.text();
}
