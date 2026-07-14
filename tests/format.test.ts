import { describe, expect, it } from 'vitest';
import { formatDate, relativeTime } from '../src/lib/format.ts';

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
