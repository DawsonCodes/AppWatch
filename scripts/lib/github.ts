/**
 * Minimal read-only access to public GitHub repositories, used by the
 * desktop providers (winget's and Homebrew's package catalogs live on
 * GitHub). In GitHub Actions the run's own GITHUB_TOKEN is passed in, which
 * lifts the API limit from 60 to 1,000 requests an hour; nothing is ever
 * written. Raw file reads go through raw.githubusercontent.com and don't
 * count against the API limit.
 */

import { createThrottle, errorMessage, fetchJson, fetchText, HttpError, withRetry } from './net.ts';

export interface GitHubClientOptions {
  /** Optional token (GITHUB_TOKEN in Actions). */
  token?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  /** Minimum spacing between API requests, in milliseconds. */
  minIntervalMs?: number;
  log?: (message: string) => void;
}

export interface GitHubClient {
  /** GET an API path such as "/repos/o/r/contents/x"; resolves to the parsed JSON. */
  api(path: string, label: string): Promise<unknown>;
  /** A file's text from raw.githubusercontent.com, or null if it doesn't exist. */
  raw(repo: string, ref: string, path: string, label: string): Promise<string | null>;
}

export class GitHubRateLimitError extends Error {}

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/** Missing files and exhausted quotas won't change on a retry. */
function isRetryable(error: unknown): boolean {
  if (error instanceof GitHubRateLimitError) return false;
  if (error instanceof HttpError) return error.status >= 500 || error.status === 429;
  return true;
}

export function createGitHubClient(options: GitHubClientOptions = {}): GitHubClient {
  const {
    token,
    fetchFn,
    timeoutMs = 25_000,
    retries = 2,
    retryDelayMs = 2000,
    minIntervalMs = 150,
    log,
  } = options;
  const throttle = createThrottle(minIntervalMs);
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  let limited = false;

  return {
    async api(path, label) {
      return withRetry(
        async () => {
          if (limited) throw new GitHubRateLimitError('GitHub API rate limit reached for this run');
          await throttle();
          try {
            return await fetchJson(`${API}${path}`, { timeoutMs, fetchFn, headers });
          } catch (error) {
            // Out of quota: stop asking for the rest of the run instead of
            // retrying (and burning time) on every listing.
            if (
              error instanceof HttpError &&
              (error.status === 403 || error.status === 429) &&
              error.headers?.get('x-ratelimit-remaining') === '0'
            ) {
              limited = true;
              log?.(`warning: GitHub API rate limit reached (${label})`);
              throw new GitHubRateLimitError('GitHub API rate limit reached for this run');
            }
            throw error;
          }
        },
        { retries, baseDelayMs: retryDelayMs, label, log, shouldRetry: isRetryable },
      );
    },

    async raw(repo, ref, path, label) {
      const url = `${RAW}/${repo}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`;
      try {
        return await withRetry(
          async () => {
            try {
              return await fetchText(url, { timeoutMs, fetchFn });
            } catch (error) {
              if (error instanceof HttpError && error.status === 404) return null;
              throw error;
            }
          },
          { retries, baseDelayMs: retryDelayMs, label, log, shouldRetry: isRetryable },
        );
      } catch (error) {
        throw new Error(`${label}: ${errorMessage(error)}`, { cause: error });
      }
    },
  };
}
