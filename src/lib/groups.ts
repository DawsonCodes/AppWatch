/**
 * App groups: one card per app, merging its App Store and Google Play
 * listings. Grouping comes from the catalog (apps.config.json); tracking,
 * history and check status stay per listing, exactly as the checker stores
 * them. Everything here is pure so it can be tested without a browser.
 */

import type { Catalog, CatalogCollection } from '../shared/catalog.ts';
import { LEGACY_COLLECTION, slugify } from '../shared/catalog.ts';
import { parseStoreInput } from '../shared/storeRefs.ts';
import type { AppRecord, Platform } from '../shared/types.ts';
import { appId } from '../shared/types.ts';
import { isRecentlyUpdated, isUnresolved } from './filtering.ts';

export type ListingSource = 'tracked' | 'local';
export type Listing = AppRecord & { source: ListingSource };

export interface AppGroup {
  key: string;
  name: string;
  collection: string;
  /** App Store first, then Google Play. */
  listings: Listing[];
  source: ListingSource;
}

/** Pseudo-collection for apps a visitor watches only in this browser. */
export const LOCAL_COLLECTION: CatalogCollection = { id: 'local', label: 'Your watches' };

export type SortKey = 'updated' | 'name' | 'collection';

export interface GroupFilters {
  query: string;
  collection: string; // 'all' or a collection id
  platform: 'all' | Platform;
  recentOnly: boolean;
  watchedOnly: boolean;
  sort: SortKey;
}

export const DEFAULT_GROUP_FILTERS: GroupFilters = {
  query: '',
  collection: 'all',
  platform: 'all',
  recentOnly: false,
  watchedOnly: false,
  sort: 'updated',
};

function byPlatform(a: Listing, b: Listing): number {
  return a.platform === b.platform ? 0 : a.platform === 'apple' ? -1 : 1;
}

/**
 * Build display groups. Catalog apps without any fetched listing yet (newly
 * added, or never resolved) get no card. Tracked listings the catalog does
 * not mention (e.g. data from before a config edit) become their own group
 * in "Other". Local listings each form a group in "Your watches".
 */
export function buildGroups(
  catalog: Catalog,
  tracked: readonly Listing[],
  local: readonly Listing[] = [],
): AppGroup[] {
  const trackedById = new Map(
    tracked.filter((listing) => !isUnresolved(listing)).map((listing) => [listing.id, listing]),
  );
  const claimed = new Set<string>();
  const groups: AppGroup[] = [];

  for (const app of catalog.apps) {
    const listings = app.listings
      .map((ref) => trackedById.get(appId(ref.platform, ref.storeId)))
      .filter((listing): listing is Listing => listing !== undefined)
      .sort(byPlatform);
    listings.forEach((listing) => claimed.add(listing.id));
    if (listings.length === 0) continue;
    groups.push({
      key: app.key,
      name: app.name ?? listings[0]!.name,
      collection: app.collection,
      listings,
      source: 'tracked',
    });
  }

  for (const listing of trackedById.values()) {
    if (claimed.has(listing.id)) continue;
    groups.push({
      key: slugify(listing.id),
      name: listing.name,
      collection: LEGACY_COLLECTION.id,
      listings: [listing],
      source: 'tracked',
    });
  }

  for (const listing of local) {
    if (trackedById.has(listing.id)) continue;
    groups.push({
      key: `local-${slugify(listing.id)}`,
      name: listing.name,
      collection: LOCAL_COLLECTION.id,
      listings: [listing],
      source: 'local',
    });
  }
  return groups;
}

/** The collections worth a tab: catalog order, only non-empty, plus extras. */
export function visibleCollections(
  catalog: Catalog,
  groups: readonly AppGroup[],
): (CatalogCollection & { count: number })[] {
  const counts = new Map<string, number>();
  for (const group of groups) counts.set(group.collection, (counts.get(group.collection) ?? 0) + 1);
  const ordered = [...catalog.collections];
  if (counts.has(LEGACY_COLLECTION.id) && !ordered.some((c) => c.id === LEGACY_COLLECTION.id)) {
    ordered.push(LEGACY_COLLECTION);
  }
  if (counts.has(LOCAL_COLLECTION.id)) ordered.push(LOCAL_COLLECTION);
  return ordered
    .filter((collection) => (counts.get(collection.id) ?? 0) > 0)
    .map((collection) => ({ ...collection, count: counts.get(collection.id) ?? 0 }));
}

function listingTime(listing: Listing): number {
  const candidate = listing.lastUpdatedAt ?? listing.releaseDate ?? listing.firstTrackedAt;
  const time = Date.parse(candidate);
  return Number.isNaN(time) ? 0 : time;
}

/** Most recent activity across the group's listings (for "newest" sorting). */
export function groupLatestTime(group: AppGroup): number {
  return Math.max(0, ...group.listings.map(listingTime));
}

/** The listing with the most recent release — used for previews and as the default tab. */
export function primaryListing(group: AppGroup): Listing {
  return [...group.listings].sort((a, b) => listingTime(b) - listingTime(a))[0]!;
}

export function groupIconUrl(group: AppGroup): string | null {
  // App Store artwork is 512px; prefer it, fall back to Play's icon.
  return (
    group.listings.find((l) => l.platform === 'apple' && l.iconUrl)?.iconUrl ??
    group.listings.find((l) => l.iconUrl)?.iconUrl ??
    null
  );
}

export function groupDeveloper(group: AppGroup): string | null {
  return group.listings.find((l) => l.developer)?.developer ?? null;
}

export function isGroupRecent(group: AppGroup, now: Date = new Date()): boolean {
  return group.listings.some((listing) => isRecentlyUpdated(listing, now));
}

export function isGroupWatched(group: AppGroup, watchedIds: ReadonlySet<string>): boolean {
  return group.source === 'local' || group.listings.some((l) => watchedIds.has(l.id));
}

function matchesQuery(group: AppGroup, query: string, refId: string | null): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (group.name.toLowerCase().includes(q)) return true;
  return group.listings.some(
    (listing) =>
      (refId !== null && listing.id === refId) ||
      listing.name.toLowerCase().includes(q) ||
      (listing.developer?.toLowerCase().includes(q) ?? false) ||
      listing.storeId.toLowerCase() === q ||
      listing.bundleId?.toLowerCase() === q,
  );
}

/**
 * Filter and sort groups. With a store filter active, each returned group
 * only carries that store's listing, so cards show exactly what matched.
 */
export function filterGroups(
  groups: readonly AppGroup[],
  filters: GroupFilters,
  watchedIds: ReadonlySet<string>,
  collectionOrder: readonly string[] = [],
  now: Date = new Date(),
): AppGroup[] {
  const ref = parseStoreInput(filters.query);
  const refId = ref ? appId(ref.platform, ref.storeId) : null;

  const result: AppGroup[] = [];
  for (const group of groups) {
    if (filters.collection !== 'all' && group.collection !== filters.collection) continue;
    const listings =
      filters.platform === 'all'
        ? group.listings
        : group.listings.filter((l) => l.platform === filters.platform);
    if (listings.length === 0) continue;
    const narrowed = listings === group.listings ? group : { ...group, listings };
    if (filters.recentOnly && !isGroupRecent(narrowed, now)) continue;
    if (filters.watchedOnly && !isGroupWatched(group, watchedIds)) continue;
    if (!matchesQuery(narrowed, filters.query, refId)) continue;
    result.push(narrowed);
  }

  const byName = (a: AppGroup, b: AppGroup) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  switch (filters.sort) {
    case 'name':
      result.sort(byName);
      break;
    case 'collection': {
      const rank = (id: string) => {
        const index = collectionOrder.indexOf(id);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
      };
      result.sort((a, b) => rank(a.collection) - rank(b.collection) || byName(a, b));
      break;
    }
    case 'updated':
      result.sort((a, b) => groupLatestTime(b) - groupLatestTime(a) || byName(a, b));
      break;
  }
  return result;
}

export function hasActiveGroupFilters(filters: GroupFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.platform !== 'all' ||
    filters.recentOnly ||
    filters.watchedOnly ||
    filters.sort !== DEFAULT_GROUP_FILTERS.sort
  );
}

/** Find the group (and listing) a deep link like `#app=apple:123` refers to. */
export function findByListingId(
  groups: readonly AppGroup[],
  listingId: string,
): { group: AppGroup; listing: Listing } | null {
  for (const group of groups) {
    const listing = group.listings.find((l) => l.id === listingId);
    if (listing) return { group, listing };
  }
  return null;
}
