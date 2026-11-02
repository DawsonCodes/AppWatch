/**
 * Hash routes. The site is a single static page on GitHub Pages, so pages are
 * addressed by the URL hash, and kept readable:
 *
 *   #/chatgpt               ChatGPT's page (its most recently updated platform)
 *   #/chatgpt/google-play   ChatGPT on Google Play
 *   #/app-store/123456      a listing outside the catalog (e.g. saved in this browser)
 *
 * Anything else is the app list. Older links (`#app=apple%3A123`) still work.
 * Links are plain anchors, so Back, Forward, new tabs and copied links all
 * work the way they do on any website.
 */

import { CATALOG } from './catalogData.ts';
import type { Catalog } from '../shared/catalog.ts';
import type { Platform } from '../shared/types.ts';
import { appId, isPlatform } from '../shared/types.ts';

export type Route =
  | { page: 'list' }
  /** A specific listing. */
  | { page: 'app'; listingId: string }
  /** A catalog app; `platform` null means its default (most recently updated) listing. */
  | { page: 'app'; appKey: string; platform: Platform | null };

const PLATFORM_SLUGS: Record<Platform, string> = {
  apple: 'app-store',
  google: 'google-play',
  windows: 'windows',
  mac: 'mac',
};

function platformFromSlug(slug: string): Platform | null {
  for (const [platform, value] of Object.entries(PLATFORM_SLUGS)) {
    if (value === slug && isPlatform(platform)) return platform;
  }
  return null;
}

interface PathIndex {
  keys: Set<string>;
  /** Listing id -> catalog app key. */
  keyByListing: Map<string, string>;
}

const indexes = new WeakMap<Catalog, PathIndex>();

function indexOf(catalog: Catalog): PathIndex {
  let index = indexes.get(catalog);
  if (!index) {
    index = { keys: new Set(), keyByListing: new Map() };
    for (const app of catalog.apps) {
      index.keys.add(app.key);
      for (const ref of app.listings)
        index.keyByListing.set(appId(ref.platform, ref.storeId), app.key);
    }
    indexes.set(catalog, index);
  }
  return index;
}

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

export function parseRoute(hash: string, catalog: Catalog = CATALOG): Route {
  // Older links: #app=apple%3A123
  const legacy = /^#app=(.+)$/.exec(hash);
  if (legacy) {
    const listingId = decode(legacy[1] ?? '');
    return listingId ? { page: 'app', listingId } : { page: 'list' };
  }

  const path = /^#\/(.+)$/.exec(hash);
  if (!path) return { page: 'list' };
  const parts = path[1]!.split('/').filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return { page: 'list' };
  const first = decode(parts[0]!);
  const second = parts[1] === undefined ? undefined : decode(parts[1]);
  if (first === null || second === null) return { page: 'list' };

  if (indexOf(catalog).keys.has(first)) {
    if (second === undefined) return { page: 'app', appKey: first, platform: null };
    const platform = platformFromSlug(second);
    return platform ? { page: 'app', appKey: first, platform } : { page: 'list' };
  }
  const platform = platformFromSlug(first);
  if (platform && second) return { page: 'app', listingId: appId(platform, second) };
  // An app that left the catalog (or a mistyped link): show "not found".
  return second === undefined ? { page: 'app', appKey: first, platform: null } : { page: 'list' };
}

/** A specific listing's page: `#/chatgpt/google-play`, or `#/app-store/123` outside the catalog. */
export function appHref(listingId: string, catalog: Catalog = CATALOG): string {
  const separator = listingId.indexOf(':');
  const platform = listingId.slice(0, separator);
  const storeId = listingId.slice(separator + 1);
  if (separator <= 0 || !isPlatform(platform)) return `#app=${encodeURIComponent(listingId)}`;
  const key = indexOf(catalog).keyByListing.get(listingId);
  return key
    ? `#/${key}/${PLATFORM_SLUGS[platform]}`
    : `#/${PLATFORM_SLUGS[platform]}/${encodeURIComponent(storeId)}`;
}

/**
 * An app's page: `#/chatgpt` for catalog apps (opening its most recently
 * updated platform), otherwise the given listing's page.
 */
export function groupHref(
  group: { key: string; listings: readonly { id: string }[] },
  fallbackListingId: string,
  catalog: Catalog = CATALOG,
): string {
  const index = indexOf(catalog);
  const isCatalogApp =
    index.keys.has(group.key) &&
    group.listings.some((listing) => index.keyByListing.get(listing.id) === group.key);
  return isCatalogApp ? `#/${group.key}` : appHref(fallbackListingId, catalog);
}
