/**
 * In-browser store discovery.
 *
 * What this honestly can and cannot do:
 *
 *  - Apple publishes a public, keyless lookup/search API (itunes.apple.com).
 *    When the visitor's browser can reach it (it does not always send CORS
 *    headers in every region/network), AppWatch resolves live metadata for
 *    App Store URLs, numeric IDs, and name searches — one request per
 *    explicit user action, never in a keystroke loop.
 *
 *  - Google Play has no public metadata API and its pages cannot be read
 *    cross-origin from a browser. Play URLs and package names are recognized
 *    and can be added as browser-local entries with a store link, but their
 *    metadata cannot be fetched client-side. No proxy is used to fake it.
 *
 *  - When live lookup is unavailable, the UI falls back to external store
 *    search links. Nothing is fabricated.
 */

import type { StoreRef } from '../shared/storeRefs.ts';

export interface DiscoveredApp {
  platform: 'apple';
  storeId: string;
  name: string;
  developer: string | null;
  iconUrl: string | null;
  storeUrl: string;
  version: string | null;
  releaseDate: string | null;
  category: string | null;
  price: string | null;
  rating: number | null;
  ratingCount: number | null;
}

export type DiscoveryOutcome =
  | { kind: 'resolved'; apps: DiscoveredApp[] }
  | { kind: 'not-found' }
  | { kind: 'unavailable'; reason: string };

interface DiscoveryOptions {
  fetchFn?: typeof fetch;
  country?: string;
  limit?: number;
  timeoutMs?: number;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Maps one raw iTunes lookup/search result onto the discovery shape. */
export function normalizeItunesResult(raw: unknown): DiscoveredApp | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const storeId =
    typeof record.trackId === 'number' ? String(record.trackId) : nonEmpty(record.trackId);
  const name = nonEmpty(record.trackName);
  if (!storeId || !name) return null;
  const rating = finite(record.averageUserRating);
  return {
    platform: 'apple',
    storeId,
    name,
    developer: nonEmpty(record.artistName) ?? nonEmpty(record.sellerName),
    iconUrl:
      nonEmpty(record.artworkUrl512) ??
      nonEmpty(record.artworkUrl100) ??
      nonEmpty(record.artworkUrl60),
    storeUrl: nonEmpty(record.trackViewUrl) ?? `https://apps.apple.com/us/app/id${storeId}`,
    version: nonEmpty(record.version),
    releaseDate: nonEmpty(record.currentVersionReleaseDate) ?? nonEmpty(record.releaseDate),
    category: nonEmpty(record.primaryGenreName),
    price: nonEmpty(record.formattedPrice),
    rating: rating !== null && rating >= 0 && rating <= 5 ? Math.round(rating * 100) / 100 : null,
    ratingCount: finite(record.userRatingCount),
  };
}

async function queryItunes(url: string, options: DiscoveryOptions): Promise<DiscoveryOutcome> {
  const { fetchFn = fetch, timeoutMs = 10_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      return {
        kind: 'unavailable',
        reason: `The App Store lookup returned HTTP ${response.status}.`,
      };
    }
    const payload = (await response.json()) as { results?: unknown };
    const results = Array.isArray(payload.results) ? payload.results : [];
    const apps = results
      .map(normalizeItunesResult)
      .filter((app): app is DiscoveredApp => app !== null);
    return apps.length > 0 ? { kind: 'resolved', apps } : { kind: 'not-found' };
  } catch {
    // Network failure or a missing CORS header — indistinguishable from here.
    return {
      kind: 'unavailable',
      reason: 'The App Store lookup could not be reached from this browser.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve one App Store listing by numeric ID. One request per call. */
export function lookupAppleById(
  storeId: string,
  options: DiscoveryOptions = {},
): Promise<DiscoveryOutcome> {
  const params = new URLSearchParams({
    id: storeId,
    country: options.country ?? 'us',
    entity: 'software',
  });
  return queryItunes(`https://itunes.apple.com/lookup?${params.toString()}`, options);
}

/** Search the App Store by name. One request per explicit submit. */
export function searchAppleByName(
  term: string,
  options: DiscoveryOptions = {},
): Promise<DiscoveryOutcome> {
  const params = new URLSearchParams({
    term,
    country: options.country ?? 'us',
    media: 'software',
    entity: 'software',
    limit: String(options.limit ?? 6),
  });
  return queryItunes(`https://itunes.apple.com/search?${params.toString()}`, options);
}

/** External store search pages — the always-available fallback. */
export function externalSearchLinks(term: string): { apple: string; google: string } {
  const query = encodeURIComponent(term.trim());
  return {
    apple: `https://www.apple.com/us/search/${query}?src=serp`,
    google: `https://play.google.com/store/search?q=${query}&c=apps`,
  };
}

/** Store page URL for a parsed ref that cannot be resolved client-side. */
export function externalStoreLink(ref: StoreRef): string {
  return ref.platform === 'apple'
    ? `https://apps.apple.com/${ref.country ?? 'us'}/app/id${ref.storeId}`
    : `https://play.google.com/store/apps/details?id=${encodeURIComponent(ref.storeId)}`;
}
