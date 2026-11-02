import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMS,
  densityProfile,
  distinctTimes,
  elapsedBand,
  forecastWindow,
  gapDistribution,
  gapsBetween,
  logLoss,
  median,
  releasesOf,
  replayCases,
  trackRecord,
  weekdayFactors,
  weightedQuantile,
} from '../src/shared/forecast.ts';

const DAY = 86_400_000;
const BASE = Date.parse('2026-08-03T16:00:00Z'); // a Monday
const timesAt = (...days: number[]) => days.map((d) => BASE + d * DAY);

describe('weightedQuantile', () => {
  it('matches the plain quantile with equal weights', () => {
    const values = [3, 7, 4, 10, 4, 7];
    const ones = values.map(() => 1);
    expect(weightedQuantile(values, ones, 0.5)).toBeCloseTo(5.5, 9);
    expect(weightedQuantile([7], [1], 0.25)).toBe(7);
  });

  it('leans toward heavier values', () => {
    expect(weightedQuantile([1, 10], [1, 3], 0.5)).toBeGreaterThan(5.5);
    expect(Number.isNaN(weightedQuantile([], [], 0.5))).toBe(true);
  });
});

describe('releases and gaps', () => {
  it('sorts releases and merges re-posts within an hour', () => {
    const releases = releasesOf([
      { version: '2', releaseDate: '2026-08-10T00:30:00Z', releaseNotes: null, detectedAt: 'x' },
      { version: '1', releaseDate: '2026-08-03T00:00:00Z', releaseNotes: null, detectedAt: 'x' },
      { version: '2b', releaseDate: '2026-08-10T00:00:00Z', releaseNotes: null, detectedAt: 'x' },
    ]);
    expect(releases.map((r) => r.version)).toEqual(['1', '2b', '2']);
    const times = distinctTimes(releases);
    expect(times).toHaveLength(2);
    expect(gapsBetween(times)).toEqual([7]);
  });

  it('computes an even-length median', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('gapDistribution', () => {
  const times = timesAt(0, 7, 14, 21, 28, 35, 42);
  const gaps = gapsBetween(times);
  const dist = gapDistribution(gaps, times, DEFAULT_PARAMS);

  it('is a proper probability distribution', () => {
    const total = dist.mass.reduce((sum, m) => sum + m, 0) + dist.tail;
    expect(total).toBeCloseTo(1, 3);
    expect(dist.mass.every((m) => m >= 0)).toBe(true);
  });

  it('is least surprised by the usual gap', () => {
    expect(logLoss(dist, 7)).toBeLessThan(logLoss(dist, 2));
    expect(logLoss(dist, 7)).toBeLessThan(logLoss(dist, 30));
    expect(Number.isFinite(logLoss(dist, 5000))).toBe(true);
  });

  it('puts the window and its midpoint around the usual gap', () => {
    const window = forecastWindow(dist, 2 / 3, 0)!;
    expect(window.from).toBeLessThan(7);
    expect(window.to).toBeGreaterThan(7);
    expect(window.point).toBeCloseTo(7, 0);
    expect(window.survival).toBeCloseTo(1, 2);
  });

  it('grows the window with the share it must hold', () => {
    const narrow = forecastWindow(dist, 0.4, 0)!;
    const wide = forecastWindow(dist, 0.9, 0)!;
    expect(wide.to - wide.from).toBeGreaterThan(narrow.to - narrow.from);
  });

  it('counts the time already waited', () => {
    const waited = forecastWindow(dist, 2 / 3, 8)!;
    expect(waited.from).toBeGreaterThanOrEqual(8);
    expect(waited.point).toBeGreaterThan(8);
    expect(waited.survival).toBeLessThan(0.5);
    expect(forecastWindow(dist, 2 / 3, 10_000)).toBeNull();
  });

  it('draws a profile holding the chance across the span', () => {
    const profile = densityProfile(dist, 0, 14, 28);
    expect(profile).toHaveLength(28);
    const inside = profile.reduce((sum, v) => sum + v, 0);
    expect(inside).toBeGreaterThan(0.9);
    expect(inside).toBeLessThanOrEqual(1.0001);
  });
});

describe('weekdayFactors', () => {
  it('averages one and favors the usual weekday', () => {
    const mondays = timesAt(0, 7, 14, 21, 28, 35, 42, 49);
    const factors = weekdayFactors(mondays, 1);
    expect(factors.reduce((sum, f) => sum + f, 0) / 7).toBeCloseTo(1, 9);
    const monday = new Date(BASE).getUTCDay();
    expect(Math.max(...factors)).toBe(factors[monday]);
    expect(weekdayFactors(mondays, 0).every((f) => Math.abs(f - 1) < 1e-9)).toBe(true);
  });
});

describe('elapsedBand', () => {
  it('splits waiting time by the typical gap', () => {
    expect(elapsedBand(0, 10)).toBe(0);
    expect(elapsedBand(6, 10)).toBe(1);
    expect(elapsedBand(12, 10)).toBe(2);
    expect(elapsedBand(40, 10)).toBe(3);
    expect(elapsedBand(3, 0)).toBe(0);
  });
});

describe('replays and track record', () => {
  it('replays each release with only what was known before it', () => {
    const times = timesAt(0, 7, 14, 21, 28, 35);
    const cases = replayCases(times);
    expect(cases).toHaveLength(2); // the 4th and 5th gaps have 3+ gaps before them
    expect(cases[0]!.gaps).toEqual([7, 7, 7]);
    expect(cases[0]!.times).toHaveLength(4);
    expect(cases[1]!.actual).toBe(7);
    expect(replayCases(times, 1)).toHaveLength(1);
  });

  it('scores steady rhythms well and needs history', () => {
    const steady = trackRecord(timesAt(...Array.from({ length: 12 }, (_, i) => i * 7)));
    expect(steady?.hits).toBe(steady?.tests);
    expect(trackRecord(timesAt(0, 7, 14, 21))).toBeNull();
  });
});
