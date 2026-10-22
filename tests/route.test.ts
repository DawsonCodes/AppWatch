import { describe, expect, it } from 'vitest';
import { appHref, parseRoute } from '../src/lib/route.ts';

describe('parseRoute', () => {
  it('treats an empty or unrelated hash as the list', () => {
    expect(parseRoute('')).toEqual({ page: 'list' });
    expect(parseRoute('#')).toEqual({ page: 'list' });
    expect(parseRoute('#main')).toEqual({ page: 'list' });
    expect(parseRoute('#app=')).toEqual({ page: 'list' });
  });

  it('reads an app page link', () => {
    expect(parseRoute('#app=apple:123')).toEqual({ page: 'app', listingId: 'apple:123' });
    expect(parseRoute('#app=google%3Acom.spotify.music')).toEqual({
      page: 'app',
      listingId: 'google:com.spotify.music',
    });
  });

  it('falls back to the list for a malformed escape', () => {
    expect(parseRoute('#app=%E0%A4%A')).toEqual({ page: 'list' });
  });

  it('round-trips through appHref', () => {
    for (const id of ['apple:123', 'google:com.a.b', 'windows:respondus-lockdown-browser']) {
      expect(parseRoute(appHref(id))).toEqual({ page: 'app', listingId: id });
    }
  });
});
