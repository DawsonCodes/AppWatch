import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CatalogError, catalogListings, parseCatalog, slugify } from '../src/shared/catalog.ts';

const chatgpt = {
  name: 'ChatGPT',
  appStore: 'https://apps.apple.com/us/app/chatgpt/id6448311069',
  googlePlay: 'https://play.google.com/store/apps/details?id=com.openai.chatgpt',
};

describe('parseCatalog — collections format', () => {
  it('parses collections of named apps with both store links', () => {
    const catalog = parseCatalog({
      collections: [{ id: 'ai', label: 'AI', apps: [chatgpt] }],
    });
    expect(catalog.collections).toEqual([{ id: 'ai', label: 'AI' }]);
    expect(catalog.apps).toEqual([
      {
        key: 'chatgpt',
        name: 'ChatGPT',
        collection: 'ai',
        listings: [
          { platform: 'apple', storeId: '6448311069', country: 'us', language: 'en' },
          { platform: 'google', storeId: 'com.openai.chatgpt', country: 'us', language: 'en' },
        ],
      },
    ]);
  });

  it('accepts bare IDs, a single store, and per-app storefront overrides', () => {
    const catalog = parseCatalog({
      country: 'US',
      collections: [
        {
          id: 'misc',
          label: 'Misc',
          apps: [
            { name: 'Only Play', googlePlay: 'org.example.only' },
            { name: 'UK Apple', appStore: '12345', country: 'GB' },
          ],
        },
      ],
    });
    expect(catalog.apps[0]?.listings).toEqual([
      { platform: 'google', storeId: 'org.example.only', country: 'us', language: 'en' },
    ]);
    expect(catalog.apps[1]?.listings[0]).toMatchObject({ storeId: '12345', country: 'gb' });
  });

  it('keeps a listing in one app only and keeps keys unique', () => {
    const catalog = parseCatalog({
      collections: [
        {
          id: 'a',
          label: 'A',
          apps: [chatgpt, { ...chatgpt }, { name: 'ChatGPT', appStore: '999999' }],
        },
      ],
    });
    expect(catalog.apps.map((app) => app.key)).toEqual(['chatgpt', 'chatgpt-2']);
    expect(catalogListings(catalog)).toHaveLength(3);
  });

  it('rejects mistakes with actionable messages', () => {
    const bad =
      (apps: unknown[], extra: Record<string, unknown> = {}) =>
      () =>
        parseCatalog({ collections: [{ id: 'x', label: 'X', apps, ...extra }] });
    expect(bad([{ appStore: '1' }])).toThrow(/name/);
    expect(bad([{ name: 'Nothing' }])).toThrow(/appStore.*googlePlay/);
    expect(bad([{ name: 'Wrong', appStore: chatgpt.googlePlay }])).toThrow(/App Store link/);
    expect(bad([{ name: 'Wrong', googlePlay: '12345' }])).toThrow(/package names/);
    expect(bad([{ name: 'Wrong', appStore: 'abc' }])).toThrow(/numeric/);
    expect(() => parseCatalog({ collections: [{ id: 'all', label: 'All', apps: [] }] })).toThrow(
      /reserved/,
    );
    expect(() =>
      parseCatalog({
        collections: [
          { id: 'a', label: 'A', apps: [] },
          { id: 'a', label: 'Again', apps: [] },
        ],
      }),
    ).toThrow(/duplicate collection/);
    expect(() => parseCatalog({ collections: [{ id: 'Bad Id', label: 'X', apps: [] }] })).toThrow(
      CatalogError,
    );
    expect(() => parseCatalog({ collections: [{ id: 'x', label: '', apps: [] }] })).toThrow(
      /label/,
    );
  });
});

describe('parseCatalog — legacy flat format', () => {
  it('puts legacy entries in an "Other" collection with store-provided names', () => {
    const catalog = parseCatalog({
      apps: [
        'https://apps.apple.com/us/app/wikipedia/id324715238',
        { platform: 'google', id: 'org.wikipedia' },
      ],
    });
    expect(catalog.collections).toEqual([{ id: 'other', label: 'Other' }]);
    expect(catalog.apps.map((app) => [app.name, app.collection, app.key])).toEqual([
      [null, 'other', 'apple-324715238'],
      [null, 'other', 'google-org-wikipedia'],
    ]);
  });

  it('requires either format', () => {
    expect(() => parseCatalog({})).toThrow(/"collections" array/);
    expect(() => parseCatalog([])).toThrow(CatalogError);
  });
});

describe('slugify', () => {
  it('makes URL-safe keys', () => {
    expect(slugify('Disney+')).toBe('disney');
    expect(slugify('Character.AI')).toBe('character-ai');
    expect(slugify('Café Été')).toBe('cafe-ete');
  });
});

describe('the repository configuration', () => {
  const raw = JSON.parse(readFileSync(new URL('../apps.config.json', import.meta.url), 'utf8'));
  const catalog = parseCatalog(raw);

  it('parses and every app has a name and both store links', () => {
    expect(catalog.apps.length).toBeGreaterThanOrEqual(50);
    for (const app of catalog.apps) {
      expect(app.name).toBeTruthy();
      expect(app.listings.map((l) => l.platform)).toEqual(['apple', 'google']);
    }
  });

  it('includes the AI and Social collections', () => {
    const names = (id: string) =>
      catalog.apps.filter((app) => app.collection === id).map((app) => app.name);
    expect(names('ai')).toEqual(
      expect.arrayContaining(['ChatGPT', 'Grok', 'Gemini', 'Microsoft Copilot']),
    );
    expect(names('social')).toEqual(
      expect.arrayContaining(['Snapchat', 'YouTube', 'X', 'Instagram', 'Facebook']),
    );
  });
});
