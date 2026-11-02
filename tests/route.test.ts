import { describe, expect, it } from 'vitest';
import { appHref, groupHref, parseRoute } from '../src/lib/route.ts';
import { parseCatalog } from '../src/shared/catalog.ts';

const catalog = parseCatalog({
  collections: [
    {
      id: 'ai',
      label: 'AI',
      apps: [
        {
          name: 'ChatGPT',
          appStore: 'https://apps.apple.com/us/app/chatgpt/id6448311069',
          googlePlay: 'https://play.google.com/store/apps/details?id=com.openai.chatgpt',
          windows: 'winget:OpenAI.ChatGPT',
        },
        { name: "Baldur's Gate 3", windows: 'steam:1086940' },
      ],
    },
  ],
});

describe('parseRoute', () => {
  it('treats an empty or unrelated hash as the list', () => {
    for (const hash of ['', '#', '#main', '#app=', '#/', '#/chatgpt/nowhere', '#/a/b/c']) {
      expect(parseRoute(hash, catalog)).toEqual({ page: 'list' });
    }
  });

  it('reads readable app links', () => {
    expect(parseRoute('#/chatgpt', catalog)).toEqual({
      page: 'app',
      appKey: 'chatgpt',
      platform: null,
    });
    expect(parseRoute('#/chatgpt/google-play', catalog)).toEqual({
      page: 'app',
      appKey: 'chatgpt',
      platform: 'google',
    });
    expect(parseRoute('#/baldurs-gate-3/windows', catalog)).toEqual({
      page: 'app',
      appKey: 'baldurs-gate-3',
      platform: 'windows',
    });
  });

  it('reads listings outside the catalog', () => {
    expect(parseRoute('#/app-store/886427730', catalog)).toEqual({
      page: 'app',
      listingId: 'apple:886427730',
    });
  });

  it('shows "not found" for an unknown app instead of the list', () => {
    expect(parseRoute('#/gone-app', catalog)).toEqual({
      page: 'app',
      appKey: 'gone-app',
      platform: null,
    });
  });

  it('still reads older links', () => {
    expect(parseRoute('#app=apple:123', catalog)).toEqual({ page: 'app', listingId: 'apple:123' });
    expect(parseRoute('#app=google%3Acom.spotify.music', catalog)).toEqual({
      page: 'app',
      listingId: 'google:com.spotify.music',
    });
    expect(parseRoute('#app=%E0%A4%A', catalog)).toEqual({ page: 'list' });
  });
});

describe('links', () => {
  it('names catalog listings by app and platform', () => {
    expect(appHref('apple:6448311069', catalog)).toBe('#/chatgpt/app-store');
    expect(appHref('windows:winget:OpenAI.ChatGPT', catalog)).toBe('#/chatgpt/windows');
    expect(appHref('windows:steam:1086940', catalog)).toBe('#/baldurs-gate-3/windows');
  });

  it('names other listings by platform and store id, and round-trips', () => {
    expect(appHref('apple:886427730', catalog)).toBe('#/app-store/886427730');
    for (const id of ['apple:123', 'google:com.a.b', 'windows:winget:A.B', 'mac:homebrew:x']) {
      expect(parseRoute(appHref(id, catalog), catalog)).toEqual({ page: 'app', listingId: id });
    }
  });

  it('links a catalog app to its own page', () => {
    const group = { key: 'chatgpt', listings: [{ id: 'apple:6448311069' }] };
    expect(groupHref(group, 'apple:6448311069', catalog)).toBe('#/chatgpt');
    const local = { key: 'local-apple-1', listings: [{ id: 'apple:1' }] };
    expect(groupHref(local, 'apple:1', catalog)).toBe('#/app-store/1');
  });
});
