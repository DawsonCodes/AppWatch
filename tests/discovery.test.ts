import { describe, expect, it, vi } from 'vitest';
import {
  externalSearchLinks,
  externalStoreLink,
  lookupAppleById,
  normalizeItunesResult,
  searchAppleByName,
} from '../src/lib/discovery.ts';

const rawResult = {
  trackId: 324715238,
  trackName: 'Wikipedia',
  artistName: 'Wikimedia Foundation',
  artworkUrl512: 'https://is1-ssl.mzstatic.com/icon512.png',
  trackViewUrl: 'https://apps.apple.com/us/app/wikipedia/id324715238',
  version: '8.2.1',
  currentVersionReleaseDate: '2026-07-08T22:15:48Z',
  primaryGenreName: 'Reference',
  formattedPrice: 'Free',
  averageUserRating: 4.6987,
  userRatingCount: 55555,
};

function fetchOk(payload: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as never;
}

describe('normalizeItunesResult', () => {
  it('maps a raw result and rounds the rating', () => {
    const app = normalizeItunesResult(rawResult);
    expect(app).toEqual({
      platform: 'apple',
      storeId: '324715238',
      name: 'Wikipedia',
      developer: 'Wikimedia Foundation',
      iconUrl: 'https://is1-ssl.mzstatic.com/icon512.png',
      storeUrl: 'https://apps.apple.com/us/app/wikipedia/id324715238',
      version: '8.2.1',
      releaseDate: '2026-07-08T22:15:48Z',
      category: 'Reference',
      price: 'Free',
      rating: 4.7,
      ratingCount: 55555,
    });
  });

  it('rejects entries without an id or name instead of fabricating them', () => {
    expect(normalizeItunesResult({ trackName: 'No ID' })).toBeNull();
    expect(normalizeItunesResult({ trackId: 1 })).toBeNull();
    expect(normalizeItunesResult(null)).toBeNull();
  });
});

describe('lookupAppleById', () => {
  it('resolves metadata through the public lookup endpoint', async () => {
    const fetchFn = fetchOk({ resultCount: 1, results: [rawResult] });
    const outcome = await lookupAppleById('324715238', { fetchFn });
    expect(outcome.kind).toBe('resolved');
    if (outcome.kind === 'resolved') {
      expect(outcome.apps[0]?.name).toBe('Wikipedia');
    }
    const url = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(url).toContain('https://itunes.apple.com/lookup?');
    expect(url).toContain('id=324715238');
  });

  it('reports not-found for empty results', async () => {
    const outcome = await lookupAppleById('999', { fetchFn: fetchOk({ results: [] }) });
    expect(outcome.kind).toBe('not-found');
  });

  it('reports unavailable on network/CORS failure without fabricating results', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as never;
    const outcome = await lookupAppleById('324715238', { fetchFn });
    expect(outcome.kind).toBe('unavailable');
    if (outcome.kind === 'unavailable') {
      expect(outcome.reason).toMatch(/could not be reached/i);
    }
  });

  it('reports unavailable on HTTP errors', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 503 })) as never;
    const outcome = await lookupAppleById('324715238', { fetchFn });
    expect(outcome.kind).toBe('unavailable');
  });

  it('times out hung requests', async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('AbortError')));
        }),
    ) as never;
    const outcome = await lookupAppleById('324715238', { fetchFn, timeoutMs: 20 });
    expect(outcome.kind).toBe('unavailable');
  });
});

describe('searchAppleByName', () => {
  it('searches with a bounded result limit', async () => {
    const fetchFn = fetchOk({ resultCount: 1, results: [rawResult] });
    const outcome = await searchAppleByName('wikipedia', { fetchFn, limit: 5 });
    expect(outcome.kind).toBe('resolved');
    const url = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(url).toContain('https://itunes.apple.com/search?');
    expect(url).toContain('term=wikipedia');
    expect(url).toContain('limit=5');
    expect(url).toContain('entity=software');
  });

  it('filters unusable rows out of mixed results', async () => {
    const outcome = await searchAppleByName('x', {
      fetchFn: fetchOk({ results: [rawResult, { junk: true }] }),
    });
    expect(outcome.kind).toBe('resolved');
    if (outcome.kind === 'resolved') expect(outcome.apps).toHaveLength(1);
  });
});

describe('external links', () => {
  it('builds store search URLs with encoded queries', () => {
    const links = externalSearchLinks('hello world');
    expect(links.google).toBe('https://play.google.com/store/search?q=hello%20world&c=apps');
    expect(links.apple).toContain('hello%20world');
  });

  it('builds direct store links for unresolved refs', () => {
    expect(externalStoreLink({ platform: 'google', storeId: 'org.wikipedia' })).toBe(
      'https://play.google.com/store/apps/details?id=org.wikipedia',
    );
    expect(externalStoreLink({ platform: 'apple', storeId: '1', country: 'de' })).toBe(
      'https://apps.apple.com/de/app/id1',
    );
  });
});
