import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '../scripts/lib/config.ts';

describe('parseConfig', () => {
  it('parses App Store URLs including country and numeric ID', () => {
    const config = parseConfig({
      apps: ['https://apps.apple.com/us/app/wikipedia/id324715238'],
    });
    expect(config.targets).toEqual([
      { platform: 'apple', storeId: '324715238', country: 'us', language: 'en' },
    ]);
  });

  it('parses App Store URLs without a country segment', () => {
    const config = parseConfig({ apps: ['https://apps.apple.com/app/id570060128'] });
    expect(config.targets[0]).toMatchObject({ platform: 'apple', storeId: '570060128' });
  });

  it('parses Google Play URLs', () => {
    const config = parseConfig({
      apps: ['https://play.google.com/store/apps/details?id=org.wikipedia&hl=en'],
    });
    expect(config.targets).toEqual([
      { platform: 'google', storeId: 'org.wikipedia', country: 'us', language: 'en' },
    ]);
  });

  it('parses object entries for both platforms', () => {
    const config = parseConfig({
      apps: [
        { platform: 'apple', id: '389801252' },
        { platform: 'google', id: 'com.duolingo' },
      ],
    });
    expect(config.targets).toHaveLength(2);
    expect(config.targets[1]).toMatchObject({ platform: 'google', storeId: 'com.duolingo' });
  });

  it('applies top-level country and language defaults', () => {
    const config = parseConfig({
      country: 'GB',
      language: 'en-GB',
      apps: [{ platform: 'apple', id: '1' }],
    });
    expect(config.targets[0]).toMatchObject({ country: 'gb', language: 'en-GB' });
  });

  it('deduplicates repeated apps', () => {
    const config = parseConfig({
      apps: [
        'https://apps.apple.com/us/app/wikipedia/id324715238',
        { platform: 'apple', id: '324715238' },
      ],
    });
    expect(config.targets).toHaveLength(1);
  });

  it('rejects malformed entries with helpful errors', () => {
    expect(() => parseConfig({ apps: ['https://example.com/app'] })).toThrow(ConfigError);
    expect(() => parseConfig({ apps: [42] })).toThrow(ConfigError);
    expect(() => parseConfig({ apps: [{ platform: 'apple', id: 'not-numeric' }] })).toThrow(
      /numeric/,
    );
    expect(() => parseConfig({ apps: [{ platform: 'google', id: 'no-dots' }] })).toThrow(
      /package name/,
    );
    expect(() => parseConfig({ apps: [{ platform: 'windows', id: 'x' }] })).toThrow(ConfigError);
    expect(() => parseConfig({})).toThrow(/"apps" array/);
    expect(() => parseConfig(null)).toThrow(ConfigError);
  });

  it('rejects Play URLs without a package id', () => {
    expect(() =>
      parseConfig({ apps: ['https://play.google.com/store/apps/details?foo=bar'] }),
    ).toThrow(/package name/);
  });
});
