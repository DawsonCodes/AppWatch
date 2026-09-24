/**
 * The tracked-app catalog: parses apps.config.json into named apps grouped
 * into collections. Shared by the update checker (which listings to check)
 * and the website (collection tabs, one card per app across both stores).
 *
 * Current format — one entry per app, with either or both store links:
 *
 *   {
 *     "country": "us",
 *     "language": "en",
 *     "collections": [
 *       {
 *         "id": "ai",
 *         "label": "AI",
 *         "apps": [
 *           {
 *             "name": "ChatGPT",
 *             "appStore": "https://apps.apple.com/us/app/chatgpt/id6448311069",
 *             "googlePlay": "https://play.google.com/store/apps/details?id=com.openai.chatgpt"
 *           }
 *         ]
 *       }
 *     ]
 *   }
 *
 * `appStore` also accepts a bare numeric ID and `googlePlay` a bare package
 * name. The older flat format (a top-level "apps" array of store URLs or
 * { "platform", "id" } objects) is still accepted; those apps land in an
 * "Other" collection.
 */

import { PLAY_PACKAGE_RE, parseStoreUrl } from './storeRefs.ts';
import type { Platform } from './types.ts';
import { appId } from './types.ts';

export class CatalogError extends Error {}

export interface CatalogListing {
  platform: Platform;
  storeId: string;
  /** Two-letter storefront/country code, e.g. "us". */
  country: string;
  /** Language code used for Google Play metadata, e.g. "en". */
  language: string;
}

export interface CatalogApp {
  /** Stable, URL-safe key derived from the name (or the first listing). */
  key: string;
  /** Display name for the merged card; null for legacy entries (store name is used). */
  name: string | null;
  collection: string;
  /** App Store listing first, then Google Play. */
  listings: CatalogListing[];
}

export interface CatalogCollection {
  id: string;
  label: string;
}

export interface Catalog {
  collections: CatalogCollection[];
  apps: CatalogApp[];
}

export const LEGACY_COLLECTION: CatalogCollection = { id: 'other', label: 'Other' };

const COLLECTION_ID_RE = /^[a-z][a-z0-9-]*$/;
const RESERVED_COLLECTION_IDS = new Set(['all', 'watched', 'local']);

interface Defaults {
  country: string;
  language: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function listingFromUrl(url: string, defaults: Defaults): CatalogListing {
  const ref = parseStoreUrl(url);
  if (ref) {
    return {
      platform: ref.platform,
      storeId: ref.storeId,
      country: ref.country ?? defaults.country,
      language: defaults.language,
    };
  }
  if (/^https?:\/\/play\.google\.com/i.test(url)) {
    throw new CatalogError(`Could not find a package name ("?id=...") in Play URL: ${url}`);
  }
  if (/^https?:\/\/(?:apps|itunes)\.apple\.com/i.test(url)) {
    throw new CatalogError(`Could not find a numeric app ID in App Store URL: ${url}`);
  }
  throw new CatalogError(
    `Unrecognized app URL: ${url}\n` +
      '  Expected an App Store URL (https://apps.apple.com/...) or a ' +
      'Google Play URL (https://play.google.com/store/apps/details?id=...).',
  );
}

/** Parses a store field: a full store URL, or a bare ID / package name. */
function listingFromField(
  value: unknown,
  platform: Platform,
  where: string,
  defaults: Defaults,
): CatalogListing {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CatalogError(`${where}: expected a store URL or ID string.`);
  }
  const text = value.trim();
  if (/^https?:\/\//i.test(text)) {
    const listing = listingFromUrl(text, defaults);
    if (listing.platform !== platform) {
      const expected = platform === 'apple' ? 'an App Store' : 'a Google Play';
      throw new CatalogError(`${where}: expected ${expected} link, got ${text}`);
    }
    return listing;
  }
  if (platform === 'apple' && !/^\d+$/.test(text)) {
    throw new CatalogError(`${where}: Apple IDs are numeric (e.g. "324715238").`);
  }
  if (platform === 'google' && !PLAY_PACKAGE_RE.test(text)) {
    throw new CatalogError(`${where}: Google Play IDs are package names (e.g. "org.wikipedia").`);
  }
  return { platform, storeId: text, country: defaults.country, language: defaults.language };
}

/** Legacy entry: a store URL string or { "platform", "id" } object. */
function legacyListing(entry: unknown, defaults: Defaults): CatalogListing {
  if (typeof entry === 'string') return listingFromUrl(entry.trim(), defaults);
  if (!isRecord(entry)) {
    throw new CatalogError(
      `Unsupported entry in "apps": ${JSON.stringify(entry)} (expected a URL string or an object).`,
    );
  }
  const { platform, id } = entry;
  if (platform !== 'apple' && platform !== 'google') {
    throw new CatalogError(
      `Entry ${JSON.stringify(entry)}: "platform" must be "apple" or "google".`,
    );
  }
  if (typeof id !== 'string' || id.length === 0) {
    throw new CatalogError(`Entry ${JSON.stringify(entry)}: "id" must be a non-empty string.`);
  }
  const local: Defaults = {
    country: typeof entry.country === 'string' ? entry.country.toLowerCase() : defaults.country,
    language: typeof entry.language === 'string' ? entry.language : defaults.language,
  };
  if (platform === 'apple' && !/^\d+$/.test(id)) {
    throw new CatalogError(
      `Entry ${JSON.stringify(entry)}: Apple IDs are numeric (e.g. "324715238").`,
    );
  }
  if (platform === 'google' && !PLAY_PACKAGE_RE.test(id)) {
    throw new CatalogError(
      `Entry ${JSON.stringify(entry)}: Google Play IDs are package names (e.g. "org.wikipedia").`,
    );
  }
  return { platform, storeId: id, country: local.country, language: local.language };
}

class CatalogBuilder {
  readonly collections: CatalogCollection[] = [];
  readonly apps: CatalogApp[] = [];
  private readonly seenListings = new Set<string>();
  private readonly usedKeys = new Set<string>();

  addApp(name: string | null, collection: string, listings: CatalogListing[]): void {
    // A listing may belong to only one app; later duplicates are ignored.
    const unique = listings.filter((listing) => {
      const id = appId(listing.platform, listing.storeId);
      if (this.seenListings.has(id)) return false;
      this.seenListings.add(id);
      return true;
    });
    if (unique.length === 0) return;
    unique.sort((a, b) => (a.platform === b.platform ? 0 : a.platform === 'apple' ? -1 : 1));
    const first = unique[0]!;
    const base = (name ? slugify(name) : '') || slugify(`${first.platform}-${first.storeId}`);
    let key = base;
    for (let n = 2; this.usedKeys.has(key); n++) key = `${base}-${n}`;
    this.usedKeys.add(key);
    this.apps.push({ key, name, collection, listings: unique });
  }
}

export function parseCatalog(raw: unknown): Catalog {
  if (!isRecord(raw)) {
    throw new CatalogError('apps.config.json must be a JSON object with an "apps" array.');
  }
  const defaults: Defaults = {
    country: typeof raw.country === 'string' ? raw.country.toLowerCase() : 'us',
    language: typeof raw.language === 'string' ? raw.language : 'en',
  };
  const hasCollections = Array.isArray(raw.collections);
  if (!hasCollections && !Array.isArray(raw.apps)) {
    throw new CatalogError(
      'apps.config.json must contain a "collections" array (or a legacy "apps" array).',
    );
  }

  const builder = new CatalogBuilder();

  if (hasCollections) {
    const ids = new Set<string>();
    (raw.collections as unknown[]).forEach((collection, ci) => {
      const where = `collections[${ci}]`;
      if (!isRecord(collection)) throw new CatalogError(`${where}: expected an object.`);
      const { id, label, apps } = collection;
      if (typeof id !== 'string' || !COLLECTION_ID_RE.test(id)) {
        throw new CatalogError(`${where}.id: use a short lowercase id such as "ai" or "social".`);
      }
      if (RESERVED_COLLECTION_IDS.has(id)) {
        throw new CatalogError(`${where}.id: "${id}" is reserved; choose another id.`);
      }
      if (ids.has(id)) throw new CatalogError(`${where}.id: duplicate collection "${id}".`);
      ids.add(id);
      if (typeof label !== 'string' || label.trim() === '') {
        throw new CatalogError(`${where}.label: expected a non-empty display label.`);
      }
      if (!Array.isArray(apps)) throw new CatalogError(`${where}.apps: expected an array.`);
      builder.collections.push({ id, label: label.trim() });

      apps.forEach((entry, ai) => {
        const at = `${where}.apps[${ai}]`;
        if (typeof entry === 'string' || (isRecord(entry) && 'platform' in entry)) {
          builder.addApp(null, id, [legacyListing(entry, defaults)]);
          return;
        }
        if (!isRecord(entry)) throw new CatalogError(`${at}: expected an object or a store URL.`);
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!name) throw new CatalogError(`${at}.name: expected the app's display name.`);
        const local: Defaults = {
          country:
            typeof entry.country === 'string' ? entry.country.toLowerCase() : defaults.country,
          language: typeof entry.language === 'string' ? entry.language : defaults.language,
        };
        const listings: CatalogListing[] = [];
        if (entry.appStore !== undefined) {
          listings.push(listingFromField(entry.appStore, 'apple', `${at}.appStore`, local));
        }
        if (entry.googlePlay !== undefined) {
          listings.push(listingFromField(entry.googlePlay, 'google', `${at}.googlePlay`, local));
        }
        if (listings.length === 0) {
          throw new CatalogError(`${at}: add an "appStore" and/or "googlePlay" link for ${name}.`);
        }
        builder.addApp(name, id, listings);
      });
    });
  }

  if (Array.isArray(raw.apps)) {
    const before = builder.apps.length;
    for (const entry of raw.apps)
      builder.addApp(null, LEGACY_COLLECTION.id, [legacyListing(entry, defaults)]);
    if (builder.apps.length > before && !builder.collections.some((c) => c.id === 'other')) {
      builder.collections.push(LEGACY_COLLECTION);
    }
  }

  return { collections: builder.collections, apps: builder.apps };
}

/** Every listing in the catalog, in catalog order. */
export function catalogListings(catalog: Catalog): CatalogListing[] {
  return catalog.apps.flatMap((app) => app.listings);
}
