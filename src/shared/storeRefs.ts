/**
 * Store reference parsing shared by the checker configuration and the
 * in-browser discovery search. A "store ref" identifies one listing on one
 * store: an Apple numeric ID or an Android package name.
 */

import type { Platform } from './types.ts';

export interface StoreRef {
  platform: Platform;
  storeId: string;
  /** Two-letter storefront hint taken from an App Store URL, when present. */
  country?: string;
}

export const APPLE_ID_RE = /^\d{4,}$/;
export const PLAY_PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

const APPLE_URL_RE = /^https?:\/\/(?:apps|itunes)\.apple\.com\/(?:([a-z]{2})\/)?.*?id(\d+)/i;
const PLAY_URL_RE = /^https?:\/\/play\.google\.com\/store\/apps\/details/i;

/** Parse an App Store or Google Play listing URL. Returns null for anything else. */
export function parseStoreUrl(url: string): StoreRef | null {
  const trimmed = url.trim();
  const apple = APPLE_URL_RE.exec(trimmed);
  if (apple) {
    const [, country, id] = apple;
    if (!id) return null;
    return country
      ? { platform: 'apple', storeId: id, country: country.toLowerCase() }
      : { platform: 'apple', storeId: id };
  }
  if (PLAY_URL_RE.test(trimmed)) {
    let packageName: string | null;
    try {
      packageName = new URL(trimmed).searchParams.get('id');
    } catch {
      packageName = null;
    }
    if (packageName && PLAY_PACKAGE_RE.test(packageName)) {
      return { platform: 'google', storeId: packageName };
    }
  }
  return null;
}

/**
 * Parse free-form search input into a store ref when it is unambiguous:
 * a store URL, a bare numeric App Store ID, or a bare Android package name.
 * Plain text (an app name) returns null and should be treated as a query.
 */
export function parseStoreInput(input: string): StoreRef | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const fromUrl = parseStoreUrl(trimmed);
  if (fromUrl) return fromUrl;
  if (APPLE_ID_RE.test(trimmed)) return { platform: 'apple', storeId: trimmed };
  if (PLAY_PACKAGE_RE.test(trimmed) && !/\s/.test(trimmed)) {
    return { platform: 'google', storeId: trimmed };
  }
  return null;
}

export function storeUrlFor(ref: StoreRef, country = 'us'): string {
  return ref.platform === 'apple'
    ? `https://apps.apple.com/${ref.country ?? country}/app/id${ref.storeId}`
    : `https://play.google.com/store/apps/details?id=${encodeURIComponent(ref.storeId)}`;
}
