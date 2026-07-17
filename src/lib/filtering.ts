/** Pure filtering and sorting for the dashboard. Kept framework-free for testing. */

import type { AppRecord, Platform } from '../shared/types.ts';
import { appId } from '../shared/types.ts';
import { parseStoreInput } from '../shared/storeRefs.ts';

export type SortKey = 'updated' | 'name' | 'platform';

export interface FilterState {
  query: string;
  platform: 'all' | Platform;
  recentOnly: boolean;
  watchedOnly: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterState = {
  query: '',
  platform: 'all',
  recentOnly: false,
  watchedOnly: false,
  sort: 'updated',
};

/** Days within which a detected update counts as "recent". */
export const RECENT_DAYS = 7;

export function isRecentlyUpdated(
  app: Pick<AppRecord, 'lastUpdatedAt'>,
  now: Date = new Date(),
  days: number = RECENT_DAYS,
): boolean {
  if (!app.lastUpdatedAt) return false;
  const time = Date.parse(app.lastUpdatedAt);
  if (Number.isNaN(time)) return false;
  const age = now.getTime() - time;
  return age >= 0 && age <= days * 24 * 3600 * 1000;
}

export function hasActiveFilters(state: FilterState): boolean {
  return (
    state.query.trim() !== '' ||
    state.platform !== 'all' ||
    state.recentOnly ||
    state.watchedOnly ||
    state.sort !== DEFAULT_FILTERS.sort
  );
}

function matchesQuery(app: AppRecord, query: string, refId: string | null): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  // A pasted store URL / ID / package name matches the exact listing.
  if (refId !== null && app.id === refId) return true;
  return (
    app.name.toLowerCase().includes(q) ||
    (app.developer !== null && app.developer.toLowerCase().includes(q)) ||
    app.storeId.toLowerCase() === q ||
    (app.bundleId !== null && app.bundleId.toLowerCase() === q)
  );
}

/** Timestamp used for "newest update" ordering; falls back through sensible fields. */
function updatedSortTime(app: AppRecord): number {
  const candidate = app.lastUpdatedAt ?? app.releaseDate ?? app.firstTrackedAt;
  const time = Date.parse(candidate);
  return Number.isNaN(time) ? 0 : time;
}

export function applyFilters<T extends AppRecord>(
  apps: readonly T[],
  state: FilterState,
  watchedIds: ReadonlySet<string>,
  now: Date = new Date(),
): T[] {
  const parsedRef = parseStoreInput(state.query);
  const refId = parsedRef ? appId(parsedRef.platform, parsedRef.storeId) : null;

  const result = apps.filter((app) => {
    if (state.platform !== 'all' && app.platform !== state.platform) return false;
    if (state.recentOnly && !isRecentlyUpdated(app, now)) return false;
    if (state.watchedOnly && !watchedIds.has(app.id)) return false;
    return matchesQuery(app, state.query, refId);
  });

  const byName = (a: AppRecord, b: AppRecord) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  switch (state.sort) {
    case 'name':
      result.sort(byName);
      break;
    case 'platform':
      result.sort((a, b) => a.platform.localeCompare(b.platform) || byName(a, b));
      break;
    case 'updated':
      result.sort((a, b) => updatedSortTime(b) - updatedSortTime(a) || byName(a, b));
      break;
  }
  return result;
}
