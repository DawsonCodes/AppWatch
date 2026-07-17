// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { configSnippetFor, createLocalAppsStore, makeLocalApp } from '../src/lib/localApps.ts';
import type { LocalApp } from '../src/lib/localApps.ts';

const NOW = new Date('2026-07-16T12:00:00.000Z');

function sample(overrides: Partial<Parameters<typeof makeLocalApp>[0]> = {}): LocalApp {
  return makeLocalApp(
    {
      platform: 'apple',
      storeId: '324715238',
      name: 'Wikipedia',
      developer: 'Wikimedia Foundation',
      iconUrl: null,
      storeUrl: 'https://apps.apple.com/us/app/id324715238',
      version: '8.2.1',
      releaseDate: null,
      category: 'Reference',
      price: 'Free',
      rating: 4.7,
      ratingCount: 1000,
      resolved: true,
      ...overrides,
    },
    NOW,
  );
}

describe('makeLocalApp', () => {
  it('derives the id and stamps addedAt/refreshedAt', () => {
    const app = sample();
    expect(app.id).toBe('apple:324715238');
    expect(app.addedAt).toBe(NOW.toISOString());
    expect(app.refreshedAt).toBe(NOW.toISOString());
  });

  it('leaves refreshedAt null for unresolved bare-ID additions', () => {
    const app = sample({ resolved: false, name: 'org.example.app' });
    expect(app.refreshedAt).toBeNull();
  });
});

describe('createLocalAppsStore', () => {
  beforeEach(() => localStorage.clear());

  it('saves, lists, deduplicates and removes local apps', () => {
    const store = createLocalAppsStore();
    expect(store.list()).toEqual([]);
    store.save(sample());
    expect(store.has('apple:324715238')).toBe(true);
    // Saving the same id replaces rather than duplicates.
    store.save(sample({ version: '8.3.0' }));
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.version).toBe('8.3.0');
    store.remove('apple:324715238');
    expect(store.list()).toEqual([]);
  });

  it('persists across store instances', () => {
    createLocalAppsStore().save(sample());
    const fresh = createLocalAppsStore();
    expect(fresh.has('apple:324715238')).toBe(true);
  });

  it('drops corrupt or foreign entries on load', () => {
    localStorage.setItem(
      'appwatch:local-apps:v1',
      JSON.stringify([sample(), { nonsense: true }, 42, null]),
    );
    expect(createLocalAppsStore().list()).toHaveLength(1);
    localStorage.setItem('appwatch:local-apps:v1', '{broken json');
    expect(createLocalAppsStore().list()).toEqual([]);
  });

  it('works in-memory when storage is unavailable', () => {
    localStorage.setItem('appwatch:local-apps:v1', JSON.stringify([sample()]));
    const store = createLocalAppsStore();
    // Simulate storage starting to throw mid-session: operations still work.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('QuotaExceededError');
    };
    try {
      expect(() => store.save(sample({ storeId: '999999', name: 'Other' }))).not.toThrow();
      expect(store.list()).toHaveLength(2);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('configSnippetFor', () => {
  it('produces the exact apps.config.json line', () => {
    expect(configSnippetFor({ storeUrl: 'https://apps.apple.com/us/app/id1' })).toBe(
      '"https://apps.apple.com/us/app/id1"',
    );
  });
});
