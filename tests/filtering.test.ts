import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  DEFAULT_FILTERS,
  hasActiveFilters,
  isRecentlyUpdated,
} from '../src/lib/filtering.ts';
import type { AppRecord } from '../src/shared/types.ts';

const NOW = new Date('2026-07-14T12:00:00.000Z');

function app(overrides: Partial<AppRecord> & { id: string; name: string }): AppRecord {
  return {
    platform: 'apple',
    storeId: overrides.id,
    developer: null,
    iconUrl: null,
    storeUrl: 'https://example.com',
    currentVersion: '1.0',
    previousVersion: null,
    releaseDate: null,
    releaseNotes: null,
    category: null,
    bundleId: null,
    firstTrackedAt: '2026-01-01T00:00:00.000Z',
    lastCheckedAt: null,
    lastUpdatedAt: null,
    checkStatus: 'ok',
    checkError: null,
    updateDetected: false,
    ...overrides,
  };
}

const wikipedia = app({
  id: 'apple:1',
  name: 'Wikipedia',
  developer: 'Wikimedia Foundation',
  lastUpdatedAt: '2026-07-13T00:00:00.000Z',
});
const duolingo = app({
  id: 'google:2',
  name: 'Duolingo',
  platform: 'google',
  developer: 'Duolingo Inc',
  lastUpdatedAt: '2026-06-01T00:00:00.000Z',
  releaseDate: '2026-06-01T00:00:00.000Z',
});
const signal = app({
  id: 'apple:3',
  name: 'Signal',
  developer: 'Signal Foundation',
  releaseDate: '2026-07-10T00:00:00.000Z',
});

const all = [wikipedia, duolingo, signal];
const none = new Set<string>();

describe('isRecentlyUpdated', () => {
  it('is true within the window and false outside it', () => {
    expect(isRecentlyUpdated(wikipedia, NOW)).toBe(true);
    expect(isRecentlyUpdated(duolingo, NOW)).toBe(false);
    expect(isRecentlyUpdated(signal, NOW)).toBe(false); // never updated
  });

  it('ignores unparsable timestamps', () => {
    expect(isRecentlyUpdated({ lastUpdatedAt: 'not a date' }, NOW)).toBe(false);
  });
});

describe('applyFilters — searching', () => {
  it('matches app names case-insensitively', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, query: 'wiki' }, none, NOW);
    expect(result.map((a) => a.name)).toEqual(['Wikipedia']);
  });

  it('matches developer names', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, query: 'foundation' }, none, NOW);
    expect(result.map((a) => a.name).sort()).toEqual(['Signal', 'Wikipedia']);
  });

  it('returns everything for a blank query', () => {
    expect(applyFilters(all, { ...DEFAULT_FILTERS, query: '   ' }, none, NOW)).toHaveLength(3);
  });
});

describe('applyFilters — filters', () => {
  it('filters by platform', () => {
    expect(
      applyFilters(all, { ...DEFAULT_FILTERS, platform: 'google' }, none, NOW).map((a) => a.name),
    ).toEqual(['Duolingo']);
  });

  it('filters recently updated apps', () => {
    expect(
      applyFilters(all, { ...DEFAULT_FILTERS, recentOnly: true }, none, NOW).map((a) => a.name),
    ).toEqual(['Wikipedia']);
  });

  it('filters watched apps using the provided id set', () => {
    const watched = new Set(['google:2']);
    expect(
      applyFilters(all, { ...DEFAULT_FILTERS, watchedOnly: true }, watched, NOW).map((a) => a.name),
    ).toEqual(['Duolingo']);
  });

  it('combines filters', () => {
    const watched = new Set(['google:2', 'apple:1']);
    const result = applyFilters(
      all,
      { ...DEFAULT_FILTERS, watchedOnly: true, platform: 'apple' },
      watched,
      NOW,
    );
    expect(result.map((a) => a.name)).toEqual(['Wikipedia']);
  });
});

describe('applyFilters — sorting', () => {
  it('sorts by newest update falling back to release date, then tracking date', () => {
    const result = applyFilters(all, DEFAULT_FILTERS, none, NOW);
    expect(result.map((a) => a.name)).toEqual(['Wikipedia', 'Signal', 'Duolingo']);
  });

  it('sorts alphabetically', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, sort: 'name' }, none, NOW);
    expect(result.map((a) => a.name)).toEqual(['Duolingo', 'Signal', 'Wikipedia']);
  });

  it('sorts by platform, then name', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, sort: 'platform' }, none, NOW);
    expect(result.map((a) => a.name)).toEqual(['Signal', 'Wikipedia', 'Duolingo']);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the defaults and true for any deviation', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, query: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, platform: 'apple' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: 'name' })).toBe(true);
  });
});
