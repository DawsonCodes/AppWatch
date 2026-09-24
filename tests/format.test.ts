import { describe, expect, it } from 'vitest';
import { compactAgo, formatDate, relativeTime } from '../src/lib/format.ts';

const NOW = new Date('2026-07-14T12:00:00.000Z');

describe('relativeTime', () => {
  it('describes past instants at a sensible granularity', () => {
    expect(relativeTime('2026-07-14T11:59:40.000Z', NOW)).toBe('just now');
    expect(relativeTime('2026-07-14T11:10:00.000Z', NOW)).toMatch(/minute/);
    expect(relativeTime('2026-07-13T12:00:00.000Z', NOW)).toMatch(/yesterday|day/);
    expect(relativeTime('2026-05-14T12:00:00.000Z', NOW)).toMatch(/month/);
    expect(relativeTime('2024-07-14T12:00:00.000Z', NOW)).toMatch(/year/);
  });

  it('returns null for missing or invalid input instead of crashing', () => {
    expect(relativeTime(null, NOW)).toBeNull();
    expect(relativeTime('garbage', NOW)).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats ISO dates and rejects invalid ones', () => {
    expect(formatDate('2026-07-01T00:00:00.000Z')).toBeTruthy();
    expect(formatDate(null)).toBeNull();
    expect(formatDate('nope')).toBeNull();
  });
});
describe('compactAgo', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  it('uses short units', () => {
    expect(compactAgo('2026-09-24T11:59:40Z', now)).toBe('just now');
    expect(compactAgo('2026-09-24T11:15:00Z', now)).toBe('45m ago');
    expect(compactAgo('2026-09-23T14:00:00Z', now)).toBe('22h ago');
    expect(compactAgo('2026-09-21T12:00:00Z', now)).toBe('3d ago');
    expect(compactAgo('2026-09-03T12:00:00Z', now)).toBe('3w ago');
    expect(compactAgo('2026-06-24T12:00:00Z', now)).toBe('3mo ago');
    expect(compactAgo('2024-09-24T12:00:00Z', now)).toBe('2y ago');
  });
  it('returns null for missing or invalid dates', () => {
    expect(compactAgo(null, now)).toBeNull();
    expect(compactAgo('nope', now)).toBeNull();
  });
});
