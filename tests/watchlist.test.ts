// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createWatchlist } from '../src/lib/watchlist.ts';

describe('createWatchlist with working storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('toggles membership and reports state', () => {
    const list = createWatchlist();
    expect(list.persistent).toBe(true);
    expect(list.has('apple:1')).toBe(false);
    expect(list.toggle('apple:1')).toBe(true);
    expect(list.has('apple:1')).toBe(true);
    expect(list.toggle('apple:1')).toBe(false);
    expect(list.has('apple:1')).toBe(false);
  });

  it('persists across instances', () => {
    createWatchlist().toggle('google:org.wikipedia');
    const fresh = createWatchlist();
    expect(fresh.has('google:org.wikipedia')).toBe(true);
    expect([...fresh.ids()]).toEqual(['google:org.wikipedia']);
  });

  it('survives corrupted stored data', () => {
    localStorage.setItem('appwatch:watchlist:v1', '{not json');
    const list = createWatchlist();
    expect(list.ids().size).toBe(0);
    localStorage.setItem('appwatch:watchlist:v1', JSON.stringify([1, 'apple:2', null]));
    const list2 = createWatchlist();
    expect([...list2.ids()]).toEqual(['apple:2']);
  });
});

describe('createWatchlist without storage', () => {
  it('falls back to a working in-memory list', () => {
    const list = createWatchlist(null);
    expect(list.persistent).toBe(false);
    expect(list.toggle('apple:1')).toBe(true);
    expect(list.has('apple:1')).toBe(true);
  });

  it('handles storage that throws on every access (private browsing)', () => {
    const throwing = new Proxy({} as Storage, {
      get() {
        return () => {
          throw new DOMException('QuotaExceededError');
        };
      },
    });
    const list = createWatchlist(throwing);
    expect(list.persistent).toBe(false);
    expect(list.toggle('apple:1')).toBe(true);
  });
});
