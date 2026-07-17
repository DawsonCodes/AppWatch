import { describe, expect, it, vi } from 'vitest';
import type { TrackTarget } from '../scripts/lib/config.ts';
import {
  createGooglePlayProvider,
  normalizePlayResult,
} from '../scripts/lib/providers/googleplay.ts';
import type { PlayAppDetails } from '../scripts/lib/providers/googleplay.ts';
import { ProviderError } from '../scripts/lib/providers/types.ts';

const target: TrackTarget = {
  platform: 'google',
  storeId: 'org.wikipedia',
  country: 'us',
  language: 'en',
};

const sampleDetails: PlayAppDetails = {
  title: 'Wikipedia',
  developer: 'Wikimedia Foundation',
  icon: 'https://play-lh.googleusercontent.com/example=w240',
  url: 'https://play.google.com/store/apps/details?id=org.wikipedia&hl=en&gl=us',
  version: '2.7.50512-r-2026-06-15',
  updated: 1750000000000,
  recentChanges: 'Fixed crashes<br>Improved search &amp; reading lists',
  genre: 'Books & Reference',
  free: true,
  priceText: 'Free',
  contentRating: 'Everyone',
  androidVersionText: '8.0',
  score: 4.5678,
  ratings: 987654,
  developerWebsite: 'https://wikimediafoundation.org/',
};

describe('normalizePlayResult', () => {
  it('maps scraper output to the normalized snapshot, stripping HTML from notes', () => {
    const snapshot = normalizePlayResult(sampleDetails, target);
    expect(snapshot).toEqual({
      platform: 'google',
      storeId: 'org.wikipedia',
      name: 'Wikipedia',
      developer: 'Wikimedia Foundation',
      iconUrl: 'https://play-lh.googleusercontent.com/example=w240',
      storeUrl: 'https://play.google.com/store/apps/details?id=org.wikipedia&hl=en&gl=us',
      version: '2.7.50512-r-2026-06-15',
      releaseDate: new Date(1750000000000).toISOString(),
      releaseNotes: 'Fixed crashes\nImproved search & reading lists',
      category: 'Books & Reference',
      bundleId: null,
      price: 'Free',
      contentRating: 'Everyone',
      requiresOs: 'Android 8.0',
      sizeBytes: null,
      rating: 4.57,
      ratingCount: 987654,
      developerWebsite: 'https://wikimediafoundation.org/',
    });
  });

  it('normalizes the minimum Android requirement and skips "varies" values', () => {
    expect(
      normalizePlayResult({ ...sampleDetails, androidVersionText: '8.0 and up' }, target)
        .requiresOs,
    ).toBe('Android 8.0 and up');
    expect(
      normalizePlayResult({ ...sampleDetails, androidVersionText: 'Varies with device' }, target)
        .requiresOs,
    ).toBeNull();
  });

  it('treats "Varies with device" as no version rather than a fake one', () => {
    expect(
      normalizePlayResult({ ...sampleDetails, version: 'Varies with device' }, target).version,
    ).toBeNull();
    expect(normalizePlayResult({ ...sampleDetails, version: 'VARY' }, target).version).toBeNull();
  });

  it('tolerates partial data with nulls and a fallback store URL', () => {
    const snapshot = normalizePlayResult({ title: 'Some App' }, target);
    expect(snapshot.name).toBe('Some App');
    expect(snapshot.version).toBeNull();
    expect(snapshot.releaseDate).toBeNull();
    expect(snapshot.storeUrl).toBe('https://play.google.com/store/apps/details?id=org.wikipedia');
  });

  it('rejects results without a title', () => {
    expect(() => normalizePlayResult({}, target)).toThrow(ProviderError);
  });
});

describe('createGooglePlayProvider', () => {
  it('uses the injected scraper and passes target options through', async () => {
    const appFn = vi.fn(async () => sampleDetails);
    const provider = createGooglePlayProvider({ loadAppFn: async () => appFn, retries: 0 });
    const snapshot = await provider(target);
    expect(snapshot.name).toBe('Wikipedia');
    expect(appFn).toHaveBeenCalledWith({ appId: 'org.wikipedia', lang: 'en', country: 'us' });
  });

  it('retries failed scrapes and eventually surfaces the error', async () => {
    const appFn = vi.fn(async () => {
      throw new Error('App not found (404)');
    });
    const provider = createGooglePlayProvider({
      loadAppFn: async () => appFn,
      retries: 2,
      retryDelayMs: 1,
    });
    await expect(provider(target)).rejects.toThrow(/404/);
    expect(appFn).toHaveBeenCalledTimes(3);
  });

  it('times out hung scrapes', async () => {
    const appFn = vi.fn(() => new Promise<PlayAppDetails>(() => {}));
    const provider = createGooglePlayProvider({
      loadAppFn: async () => appFn,
      retries: 0,
      timeoutMs: 20,
    });
    await expect(provider(target)).rejects.toThrow(/timed out/);
  });
});
