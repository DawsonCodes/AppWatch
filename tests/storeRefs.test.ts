import { describe, expect, it } from 'vitest';
import { parseStoreInput, parseStoreUrl, storeUrlFor } from '../src/shared/storeRefs.ts';

describe('parseStoreUrl', () => {
  it('parses App Store URLs with and without a country segment', () => {
    expect(parseStoreUrl('https://apps.apple.com/us/app/wikipedia/id324715238')).toEqual({
      platform: 'apple',
      storeId: '324715238',
      country: 'us',
    });
    expect(parseStoreUrl('https://apps.apple.com/app/id570060128')).toEqual({
      platform: 'apple',
      storeId: '570060128',
    });
    expect(parseStoreUrl('https://itunes.apple.com/gb/app/id1?mt=8')).toEqual({
      platform: 'apple',
      storeId: '1',
      country: 'gb',
    });
  });

  it('parses Google Play URLs', () => {
    expect(
      parseStoreUrl('https://play.google.com/store/apps/details?id=org.wikipedia&hl=en'),
    ).toEqual({ platform: 'google', storeId: 'org.wikipedia' });
  });

  it('returns null for anything else', () => {
    expect(parseStoreUrl('https://example.com/app/id123')).toBeNull();
    expect(parseStoreUrl('https://play.google.com/store/apps/details?foo=bar')).toBeNull();
    expect(parseStoreUrl('not a url')).toBeNull();
  });
});

describe('parseStoreInput', () => {
  it('recognizes URLs, bare Apple IDs and bare package names', () => {
    expect(parseStoreInput(' https://apps.apple.com/us/app/x/id324715238 ')).toMatchObject({
      platform: 'apple',
      storeId: '324715238',
    });
    expect(parseStoreInput('324715238')).toEqual({ platform: 'apple', storeId: '324715238' });
    expect(parseStoreInput('org.mozilla.firefox')).toEqual({
      platform: 'google',
      storeId: 'org.mozilla.firefox',
    });
  });

  it('treats plain text queries as non-refs', () => {
    expect(parseStoreInput('firefox browser')).toBeNull();
    expect(parseStoreInput('wiki')).toBeNull();
    expect(parseStoreInput('123')).toBeNull(); // too short to be an Apple ID
    expect(parseStoreInput('')).toBeNull();
    expect(parseStoreInput('   ')).toBeNull();
  });
});

describe('storeUrlFor', () => {
  it('builds canonical store URLs', () => {
    expect(storeUrlFor({ platform: 'apple', storeId: '1', country: 'gb' })).toBe(
      'https://apps.apple.com/gb/app/id1',
    );
    expect(storeUrlFor({ platform: 'apple', storeId: '1' })).toBe(
      'https://apps.apple.com/us/app/id1',
    );
    expect(storeUrlFor({ platform: 'google', storeId: 'org.wikipedia' })).toBe(
      'https://play.google.com/store/apps/details?id=org.wikipedia',
    );
  });
});
