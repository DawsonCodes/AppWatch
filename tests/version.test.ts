import { describe, expect, it } from 'vitest';
import { compareVersions, isVersionChange } from '../src/shared/version.ts';

describe('compareVersions', () => {
  it('compares plain semver-like versions numerically', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('10.0', '9.99.99')).toBeGreaterThan(0);
  });

  it('handles differing segment counts', () => {
    expect(compareVersions('1.2', '1.2.0')).toBeLessThan(0);
    expect(compareVersions('1.2.1', '1.2')).toBeGreaterThan(0);
  });

  it('handles calendar-style and non-numeric segments', () => {
    expect(compareVersions('2024.06.1', '2024.05.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3-beta', '1.2.3-alpha')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('ignores surrounding whitespace and separator variety', () => {
    expect(compareVersions(' 1.2.3 ', '1-2-3')).toBe(0);
  });
});

describe('isVersionChange', () => {
  it('detects any difference between non-empty versions', () => {
    expect(isVersionChange('1.0.0', '1.0.1')).toBe(true);
    expect(isVersionChange('2.0', '1.9')).toBe(true); // rollbacks count as changes
  });

  it('never fires for null or matching values', () => {
    expect(isVersionChange(null, '1.0.0')).toBe(false);
    expect(isVersionChange('1.0.0', null)).toBe(false);
    expect(isVersionChange(null, null)).toBe(false);
    expect(isVersionChange('1.0.0', '1.0.0')).toBe(false);
    expect(isVersionChange('1.0.0', ' 1.0.0 ')).toBe(false);
  });
});
