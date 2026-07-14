import { describe, expect, it, vi } from 'vitest';
import type { TrackTarget } from '../scripts/lib/config.ts';
import {
  createAppleProvider,
  lookupUrl,
  normalizeAppleResult,
} from '../scripts/lib/providers/apple.ts';
import { ProviderError } from '../scripts/lib/providers/types.ts';

const target: TrackTarget = {
  platform: 'apple',
  storeId: '324715238',
  country: 'us',
  language: 'en',
};

const sampleResult = {
  resultCount: 1,
  results: [
    {
      trackName: 'Wikipedia',
      artistName: 'Wikimedia Foundation',
      artworkUrl512: 'https://is1-ssl.mzstatic.com/image/thumb/example/512x512bb.jpg',
      version: '7.4.1',
      currentVersionReleaseDate: '2026-06-20T17:23:44Z',
      releaseNotes: 'Bug fixes and performance improvements.',
      trackViewUrl: 'https://apps.apple.com/us/app/wikipedia/id324715238',
      primaryGenreName: 'Reference',
      bundleId: 'org.wikimedia.wikipedia',
    },
  ],
};

function fetchStub(payload: unknown, status = 200): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('lookupUrl', () => {
  it('builds the documented iTunes lookup URL', () => {
    expect(lookupUrl('324715238', 'us')).toBe(
      'https://itunes.apple.com/lookup?id=324715238&country=us&entity=software',
    );
  });
});

describe('normalizeAppleResult', () => {
  it('maps a full lookup result to the normalized snapshot', () => {
    const snapshot = normalizeAppleResult(sampleResult, target);
    expect(snapshot).toEqual({
      platform: 'apple',
      storeId: '324715238',
      name: 'Wikipedia',
      developer: 'Wikimedia Foundation',
      iconUrl: 'https://is1-ssl.mzstatic.com/image/thumb/example/512x512bb.jpg',
      storeUrl: 'https://apps.apple.com/us/app/wikipedia/id324715238',
      version: '7.4.1',
      releaseDate: '2026-06-20T17:23:44.000Z',
      releaseNotes: 'Bug fixes and performance improvements.',
      category: 'Reference',
      bundleId: 'org.wikimedia.wikipedia',
    });
  });

  it('tolerates partial data, using null instead of fabricated values', () => {
    const snapshot = normalizeAppleResult(
      { resultCount: 1, results: [{ trackName: 'Mystery App' }] },
      target,
    );
    expect(snapshot.name).toBe('Mystery App');
    expect(snapshot.version).toBeNull();
    expect(snapshot.developer).toBeNull();
    expect(snapshot.releaseNotes).toBeNull();
    expect(snapshot.releaseDate).toBeNull();
    expect(snapshot.storeUrl).toBe('https://apps.apple.com/us/app/id324715238');
  });

  it('throws a clear error when the app is not found', () => {
    expect(() => normalizeAppleResult({ resultCount: 0, results: [] }, target)).toThrow(
      ProviderError,
    );
    expect(() => normalizeAppleResult({ resultCount: 0, results: [] }, target)).toThrow(
      /not found/,
    );
  });

  it('rejects results with no usable name', () => {
    expect(() =>
      normalizeAppleResult({ resultCount: 1, results: [{ version: '1.0' }] }, target),
    ).toThrow(/trackName/);
  });
});

describe('createAppleProvider', () => {
  it('fetches and normalizes via the injected fetch', async () => {
    const fetchFn = fetchStub(sampleResult);
    const provider = createAppleProvider({ fetchFn, retries: 0 });
    const snapshot = await provider(target);
    expect(snapshot.name).toBe('Wikipedia');
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('surfaces HTTP errors after exhausting retries', async () => {
    const fetchFn = fetchStub({}, 503);
    const provider = createAppleProvider({ fetchFn, retries: 1, retryDelayMs: 1 });
    await expect(provider(target)).rejects.toThrow(/HTTP 503/);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('recovers when a retry succeeds', async () => {
    const calls: number[] = [];
    const fetchFn = vi.fn(async () => {
      calls.push(1);
      if (calls.length === 1) throw new Error('socket hang up');
      return new Response(JSON.stringify(sampleResult), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = createAppleProvider({ fetchFn, retries: 2, retryDelayMs: 1 });
    const snapshot = await provider(target);
    expect(snapshot.version).toBe('7.4.1');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
