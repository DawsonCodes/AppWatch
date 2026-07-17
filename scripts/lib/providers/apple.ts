/**
 * Apple App Store provider.
 *
 * Uses the public iTunes Lookup API (https://itunes.apple.com/lookup), which is
 * Apple's long-standing, documented endpoint for app metadata. It requires no
 * API key and returns JSON including version, release notes and release date.
 */

import { fetchJson, withRetry } from '../net.ts';
import type { TrackTarget } from '../config.ts';
import type { AppSnapshot, ProviderFetch } from './types.ts';
import { asFiniteNumber, asIsoDate, asNonEmptyString, ProviderError } from './types.ts';

interface AppleProviderOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
}

export function lookupUrl(storeId: string, country: string): string {
  const params = new URLSearchParams({ id: storeId, country, entity: 'software' });
  return `https://itunes.apple.com/lookup?${params.toString()}`;
}

export function createAppleProvider(options: AppleProviderOptions = {}): ProviderFetch {
  const { fetchFn, timeoutMs = 15_000, retries = 2, retryDelayMs = 1500, log } = options;

  return async function fetchAppleApp(target: TrackTarget): Promise<AppSnapshot> {
    const url = lookupUrl(target.storeId, target.country);
    const payload = await withRetry(() => fetchJson(url, { timeoutMs, fetchFn }), {
      retries,
      baseDelayMs: retryDelayMs,
      label: `apple:${target.storeId}`,
      log,
    });
    return normalizeAppleResult(payload, target);
  };
}

/** Maps a raw iTunes Lookup response onto the normalized snapshot shape. */
export function normalizeAppleResult(payload: unknown, target: TrackTarget): AppSnapshot {
  if (typeof payload !== 'object' || payload === null) {
    throw new ProviderError('Unexpected response from the iTunes Lookup API (not an object)');
  }
  const { results } = payload as { results?: unknown };
  if (!Array.isArray(results) || results.length === 0) {
    throw new ProviderError(
      `App ${target.storeId} was not found in the ${target.country.toUpperCase()} App Store`,
    );
  }
  const raw = results[0] as Record<string, unknown>;
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
