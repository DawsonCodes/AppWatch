import { describe, expect, it } from 'vitest';
import { dataUrl, withBase } from '../src/lib/urls.ts';

describe('withBase', () => {
  it('joins under the GitHub Pages project base path', () => {
    expect(withBase('data/apps.json', '/AppWatch/')).toBe('/AppWatch/data/apps.json');
  });

  it('works at the domain root (local dev)', () => {
    expect(withBase('data/apps.json', '/')).toBe('/data/apps.json');
  });

  it('normalizes missing and duplicate slashes', () => {
    expect(withBase('/data/apps.json', '/AppWatch')).toBe('/AppWatch/data/apps.json');
    expect(withBase('//data/apps.json', '/AppWatch/')).toBe('/AppWatch/data/apps.json');
  });
});

describe('dataUrl', () => {
  it('builds data file URLs under the configured base', () => {
    expect(dataUrl('status.json', '/AppWatch/')).toBe('/AppWatch/data/status.json');
  });
});
