/**
 * Apple App Store provider.
 *
 * Uses the public iTunes Lookup API (https://itunes.apple.com/lookup), which is
 * Apple's long-standing, documented endpoint for app metadata. It requires no
 * API key and returns JSON including version, release notes and release date.
 */

import { createThrottle, errorMessage, fetchJson, withRetry } from '../net.ts';
import type { TrackTarget } from '../config.ts';
import type { AppSnapshot, ProviderFetch } from './types.ts';
import { asFiniteNumber, asIsoDate, asNonEmptyString, ProviderError } from './types.ts';

interface AppleProviderOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  /** Minimum spacing between requests to Apple, in milliseconds. */
  minIntervalMs?: number;
  /** How many app IDs to resolve per batched lookup request. */
  batchSize?: number;
  log?: (message: string) => void;
}

/** Conservative batch size; the lookup endpoint accepts comma-separated IDs. */
export const APPLE_BATCH_SIZE = 50;

/**
 * Builds a lookup URL for one or more numeric App Store IDs. IDs are digits
 * only, so they are joined with literal commas (the documented form).
 */
export function lookupUrl(storeIds: string | readonly string[], country: string): string {
  const ids = typeof storeIds === 'string' ? [storeIds] : storeIds;
  const params = new URLSearchParams({ country, entity: 'software' });
  return `https://itunes.apple.com/lookup?id=${ids.join(',')}&${params.toString()}`;
}

/** Sentinel cached for IDs a batch lookup answered with "no such app". */
const NOT_FOUND = Symbol('not-found');

export function createAppleProvider(options: AppleProviderOptions = {}): ProviderFetch {
  const {
    fetchFn,
    timeoutMs = 15_000,
    retries = 2,
    retryDelayMs = 1500,
    minIntervalMs = 1000,
    batchSize = APPLE_BATCH_SIZE,
    log,
  } = options;
  const throttle = createThrottle(minIntervalMs);
  // Results from batched lookups, keyed by `${country}:${storeId}`.
  const cache = new Map<string, Record<string, unknown> | typeof NOT_FOUND>();

  async function request(url: string, label: string): Promise<unknown> {
    return withRetry(
      async () => {
        await throttle();
        return fetchJson(url, { timeoutMs, fetchFn });
      },
      { retries, baseDelayMs: retryDelayMs, label, log },
    );
  }

  async function fetchAppleApp(target: TrackTarget): Promise<AppSnapshot> {
    const cached = cache.get(`${target.country}:${target.storeId}`);
    if (cached === NOT_FOUND) throw notFound(target);
    if (cached) return normalizeAppleRecord(cached, target);
    const payload = await request(
      lookupUrl(target.storeId, target.country),
      `apple:${target.storeId}`,
    );
    return normalizeAppleResult(payload, target);
  }

  /** Resolve many apps with a handful of batched requests instead of one each. */
  fetchAppleApp.prime = async (targets: readonly TrackTarget[]): Promise<void> => {
    const byCountry = new Map<string, string[]>();
    for (const target of targets) {
      const ids = byCountry.get(target.country) ?? [];
      if (!ids.includes(target.storeId)) ids.push(target.storeId);
      byCountry.set(target.country, ids);
    }
    for (const [country, ids] of byCountry) {
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        try {
          const payload = await request(lookupUrl(chunk, country), `apple:batch(${chunk.length})`);
          const results = (payload as { results?: unknown }).results;
          if (!Array.isArray(results)) continue;
          const found = new Set<string>();
          for (const result of results) {
            if (typeof result !== 'object' || result === null) continue;
            const record = result as Record<string, unknown>;
            const id = record.trackId === undefined ? null : String(record.trackId);
            if (id && chunk.includes(id)) {
              cache.set(`${country}:${id}`, record);
              found.add(id);
            }
          }
          // A successful batch that omits an ID means the store has no such app.
          for (const id of chunk) {
            if (!found.has(id)) cache.set(`${country}:${id}`, NOT_FOUND);
          }
        } catch (error) {
          log?.(
            `apple: batch lookup failed (${errorMessage(error)}); ` +
              'those apps will be looked up individually',
          );
        }
      }
    }
  };

  return fetchAppleApp;
}

function notFound(target: TrackTarget): ProviderError {
  return new ProviderError(
    `App ${target.storeId} was not found in the ${target.country.toUpperCase()} App Store`,
  );
}

/** Maps a raw iTunes Lookup response (single-app lookup) onto the snapshot shape. */
export function normalizeAppleResult(payload: unknown, target: TrackTarget): AppSnapshot {
  if (typeof payload !== 'object' || payload === null) {
    throw new ProviderError('Unexpected response from the iTunes Lookup API (not an object)');
  }
  const { results } = payload as { results?: unknown };
  if (!Array.isArray(results) || results.length === 0) {
    throw notFound(target);
  }
  return normalizeAppleRecord(results[0] as Record<string, unknown>, target);
}

/** Maps one raw iTunes result record onto the normalized snapshot shape. */
export function normalizeAppleRecord(
  raw: Record<string, unknown>,
  target: TrackTarget,
): AppSnapshot {
  const name = asNonEmptyString(raw.trackName);
  if (!name) {
    throw new ProviderError('iTunes Lookup response is missing the app name (trackName)');
  }
  return {
    platform: 'apple',
    storeId: target.storeId,
    name,
    developer: asNonEmptyString(raw.artistName) ?? asNonEmptyString(raw.sellerName),
    iconUrl:
      asNonEmptyString(raw.artworkUrl512) ??
      asNonEmptyString(raw.artworkUrl100) ??
      asNonEmptyString(raw.artworkUrl60),
    storeUrl:
      asNonEmptyString(raw.trackViewUrl) ??
      `https://apps.apple.com/${target.country}/app/id${target.storeId}`,
    version: asNonEmptyString(raw.version),
    releaseDate: asIsoDate(raw.currentVersionReleaseDate) ?? asIsoDate(raw.releaseDate),
    releaseNotes: asNonEmptyString(raw.releaseNotes),
    category: asNonEmptyString(raw.primaryGenreName),
    bundleId: asNonEmptyString(raw.bundleId),
    price:
      asNonEmptyString(raw.formattedPrice) ?? (asFiniteNumber(raw.price) === 0 ? 'Free' : null),
    contentRating: asNonEmptyString(raw.contentAdvisoryRating),
    requiresOs: minimumOs(raw.minimumOsVersion),
    sizeBytes: asFiniteNumber(raw.fileSizeBytes),
    rating: roundedRating(raw.averageUserRating),
    ratingCount: asFiniteNumber(raw.userRatingCount),
    developerWebsite: asNonEmptyString(raw.sellerUrl),
  };
}

function minimumOs(value: unknown): string | null {
  const version = asNonEmptyString(value);
  return version ? `iOS ${version} or later` : null;
}

function roundedRating(value: unknown): number | null {
  const rating = asFiniteNumber(value);
  if (rating === null || rating < 0 || rating > 5) return null;
  return Math.round(rating * 100) / 100;
}
