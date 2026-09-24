import { describe, expect, it } from 'vitest';
import { parseCatalog } from '../src/shared/catalog.ts';
import type { AppRecord } from '../src/shared/types.ts';
import {
  buildGroups,
  DEFAULT_GROUP_FILTERS,
  filterGroups,
  findByListingId,
  groupIconUrl,
  isGroupWatched,
  primaryListing,
  visibleCollections,
} from '../src/lib/groups.ts';
import type { Listing } from '../src/lib/groups.ts';

const NOW = new Date('2026-09-24T12:00:00.000Z');

function listing(id: string, overrides: Partial<AppRecord> = {}): Listing {
  const [platform, storeId] = id.split(':') as ['apple' | 'google', string];
  return {
    id,
    platform,
    storeId,
    name: `Store name ${storeId}`,
    developer: 'Dev Co',
    iconUrl: `https://icons.example/${storeId}.png`,
    storeUrl: 'https://example.com',
    currentVersion: '1.0',
    previousVersion: null,
    releaseDate: '2026-09-01T00:00:00.000Z',
    releaseNotes: null,
    category: null,
    bundleId: null,
    firstTrackedAt: '2026-08-01T00:00:00.000Z',
    lastCheckedAt: '2026-09-24T10:00:00.000Z',
    lastUpdatedAt: null,
    checkStatus: 'ok',
    checkError: null,
    updateDetected: false,
    ...overrides,
    source: 'tracked',
  };
}

const catalog = parseCatalog({
  collections: [
    {
      id: 'ai',
      label: 'AI',
      apps: [
        { name: 'ChatGPT', appStore: '6448311069', googlePlay: 'com.openai.chatgpt' },
        { name: 'Grok', appStore: '6670324846', googlePlay: 'ai.x.grok' },
      ],
    },
    {
      id: 'social',
      label: 'Social',
      apps: [{ name: 'Snapchat', appStore: '447188370', googlePlay: 'com.snapchat.android' }],
    },
    { id: 'empty', label: 'Nothing yet', apps: [{ name: 'Pending', appStore: '1234567' }] },
  ],
});

const tracked: Listing[] = [
  listing('apple:6448311069', { name: 'ChatGPT', lastUpdatedAt: '2026-09-23T00:00:00.000Z' }),
  listing('google:com.openai.chatgpt', { name: 'ChatGPT', iconUrl: 'https://play/icon' }),
  listing('google:ai.x.grok', { name: 'Grok', releaseDate: '2026-09-20T00:00:00.000Z' }),
  listing('apple:447188370', { name: 'Snapchat', developer: 'Snap, Inc.' }),
  listing('google:com.snapchat.android', { name: 'Snapchat', currentVersion: null }),
  // Never resolved: must not produce a card.
  listing('apple:6670324846', {
    name: '6670324846',
    checkStatus: 'error',
    currentVersion: null,
    lastCheckedAt: null,
  }),
  // Tracked but not in the catalog (e.g. data from before a config edit).
  listing('apple:999999', { name: 'Leftover' }),
];

describe('buildGroups', () => {
  const groups = buildGroups(catalog, tracked);

  it('merges each app across stores into one group, App Store first', () => {
    const chatgpt = groups.find((g) => g.key === 'chatgpt')!;
    expect(chatgpt.name).toBe('ChatGPT');
    expect(chatgpt.collection).toBe('ai');
    expect(chatgpt.listings.map((l) => l.id)).toEqual([
      'apple:6448311069',
      'google:com.openai.chatgpt',
    ]);
  });

  it('skips unresolved listings and apps without any data yet', () => {
    const grok = groups.find((g) => g.key === 'grok')!;
    expect(grok.listings.map((l) => l.id)).toEqual(['google:ai.x.grok']);
    expect(groups.some((g) => g.key === 'pending')).toBe(false);
  });

  it('keeps uncatalogued tracked listings visible under Other', () => {
    const leftover = groups.find((g) => g.name === 'Leftover')!;
    expect(leftover.collection).toBe('other');
  });

  it('adds browser-local apps as their own group in "Your watches"', () => {
    const local: Listing = { ...listing('apple:5555555', { name: 'Local App' }), source: 'local' };
    const withLocal = buildGroups(catalog, tracked, [local]);
    const group = withLocal.find((g) => g.name === 'Local App')!;
    expect(group.collection).toBe('local');
    expect(group.source).toBe('local');
  });

  it('reports only non-empty collections, with counts', () => {
    expect(visibleCollections(catalog, groups)).toEqual([
      { id: 'ai', label: 'AI', count: 2 },
      { id: 'social', label: 'Social', count: 1 },
      { id: 'other', label: 'Other', count: 1 },
    ]);
  });
});

describe('group helpers', () => {
  const groups = buildGroups(catalog, tracked);
  const chatgpt = groups.find((g) => g.key === 'chatgpt')!;

  it('picks the listing with the most recent activity as primary', () => {
    expect(primaryListing(chatgpt).id).toBe('apple:6448311069');
  });

  it('prefers the App Store icon', () => {
    expect(groupIconUrl(chatgpt)).toBe('https://icons.example/6448311069.png');
  });

  it('treats a group as watched when any of its listings is watched', () => {
    expect(isGroupWatched(chatgpt, new Set(['google:com.openai.chatgpt']))).toBe(true);
    expect(isGroupWatched(chatgpt, new Set())).toBe(false);
  });

  it('finds the group behind a listing deep link', () => {
    expect(findByListingId(groups, 'google:com.snapchat.android')?.group.name).toBe('Snapchat');
    expect(findByListingId(groups, 'apple:0')).toBeNull();
  });
});

describe('filterGroups', () => {
  const groups = buildGroups(catalog, tracked);
  const run = (patch: Partial<typeof DEFAULT_GROUP_FILTERS>, watched = new Set<string>()) =>
    filterGroups(groups, { ...DEFAULT_GROUP_FILTERS, ...patch }, watched, ['ai', 'social'], NOW);

  it('filters by collection tab', () => {
    expect(run({ collection: 'ai' }).map((g) => g.name)).toEqual(['ChatGPT', 'Grok']);
  });

  it('narrows cards to the selected store', () => {
    const result = run({ platform: 'google', collection: 'ai' });
    expect(result.find((g) => g.name === 'ChatGPT')?.listings.map((l) => l.platform)).toEqual([
      'google',
    ]);
    expect(run({ platform: 'apple' }).some((g) => g.name === 'Grok')).toBe(false);
  });

  it('searches by app name, store name, developer, and pasted store links', () => {
    expect(run({ query: 'snap' }).map((g) => g.name)).toEqual(['Snapchat']);
    expect(run({ query: 'snap, inc' }).map((g) => g.name)).toEqual(['Snapchat']);
    expect(
      run({ query: 'https://play.google.com/store/apps/details?id=ai.x.grok' }).map((g) => g.name),
    ).toEqual(['Grok']);
  });

  it('filters recently updated and watched apps', () => {
    expect(run({ recentOnly: true }).map((g) => g.name)).toEqual(['ChatGPT']);
    expect(run({ watchedOnly: true }, new Set(['apple:447188370'])).map((g) => g.name)).toEqual([
      'Snapchat',
    ]);
  });

  it('sorts by newest activity, name, or collection order', () => {
    expect(run({}).map((g) => g.name)[0]).toBe('ChatGPT');
    expect(run({ sort: 'name' }).map((g) => g.name)).toEqual([
      'ChatGPT',
      'Grok',
      'Leftover',
      'Snapchat',
    ]);
    expect(run({ sort: 'collection' }).map((g) => g.collection)).toEqual([
      'ai',
      'ai',
      'social',
      'other',
    ]);
  });
});
