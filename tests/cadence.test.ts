import { describe, expect, it } from 'vitest';
import {
  backtestCadence,
  computeCadence,
  describeDays,
  describeRange,
  nextSortTime,
  quantile,
  relativeDay,
  rhythmLine,
  weightedQuantile,
} from '../src/lib/cadence.ts';
import type { VersionHistoryEntry } from '../src/shared/types.ts';

const DAY = 86_400_000;
const BASE = Date.parse('2026-08-03T16:00:00Z'); // a Monday

/** Entries released `daysAfterBase` days after BASE, newest first like history.json. */
function entries(...daysAfterBase: number[]): VersionHistoryEntry[] {
  return daysAfterBase
    .map((d, i) => ({
      version: `1.${i}`,
      releaseDate: new Date(BASE + d * DAY).toISOString(),
      releaseNotes: null,
      detectedAt: new Date(BASE + d * DAY + 3600_000).toISOString(),
    }))
    .reverse();
}

describe('quantile', () => {
  it('interpolates', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([7], 0.25)).toBe(7);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });
});

describe('weightedQuantile', () => {
  it('matches the plain quantile with equal weights', () => {
    const values = [3, 7, 4, 10, 4, 7];
    const ones = values.map(() => 1);
    const sorted = [...values].sort((a, b) => a - b);
    for (const q of [0.25, 0.5, 0.75]) {
      expect(weightedQuantile(values, ones, q)).toBeCloseTo(quantile(sorted, q), 9);
    }
  });

  it('leans toward heavier values', () => {
    expect(weightedQuantile([1, 10], [1, 3], 0.5)).toBeGreaterThan(5.5);
    expect(Number.isNaN(weightedQuantile([], [], 0.5))).toBe(true);
  });
});

describe('backtestCadence', () => {
  it('scores a steady rhythm as accurate', () => {
    const days = Array.from({ length: 12 }, (_, i) => i * 7);
    const accuracy = backtestCadence(entries(...days));
    expect(accuracy).not.toBeNull();
    expect(accuracy!.tests).toBe(8); // gaps 4..11 each checked against the gaps before
    expect(accuracy!.hits).toBe(8);
    expect(accuracy!.medianErrorDays).toBeLessThan(0.5);
  });

  it('scores an erratic one as inaccurate, and needs some history', () => {
    const accuracy = backtestCadence(entries(0, 1, 15, 16, 40, 41, 80, 81, 130));
    expect(accuracy!.hits).toBeLessThan(accuracy!.tests);
    expect(accuracy!.medianErrorDays).toBeGreaterThan(5);
    expect(backtestCadence(entries(0, 7, 14, 21))).toBeNull();
  });
});

describe('computeCadence', () => {
  it('needs at least three gaps before predicting', () => {
    const c = computeCadence(entries(0, 7, 14), new Date(BASE + 15 * DAY));
    expect(c.state).toBe('insufficient');
    expect(c.next).toBeNull();
    expect(c.gaps).toHaveLength(2);
    expect(c.last?.version).toBe('1.2');
  });

  it('predicts a weekly rhythm', () => {
    const c = computeCadence(entries(0, 7, 14, 21, 28), new Date(BASE + 30 * DAY));
    expect(c.typicalDays).toBe(7);
    expect(c.rangeDays).toEqual([6.5, 7.5]); // widened to at least a day
    expect(c.next?.likely).toBe(BASE + 35 * DAY);
    expect(c.state).toBe('upcoming');
    expect(c.confidence).toBe('low'); // only four gaps
    expect(c.weekday?.day).toBe(new Date(BASE).getDay());
  });

  it('marks due and overdue', () => {
    const history = entries(0, 7, 14, 21, 28);
    expect(computeCadence(history, new Date(BASE + 35 * DAY)).state).toBe('due');
    expect(computeCadence(history, new Date(BASE + 40 * DAY)).state).toBe('overdue');
  });

  it('uses the middle half of recent gaps, weighted to the newest, as the window', () => {
    const c = computeCadence(entries(0, 3, 10, 14, 24, 28, 35), new Date(BASE + 36 * DAY));
    // gaps: 3, 7, 4, 10, 4, 7 (newest last); a plain median would be 5.5
    expect(c.typicalDays).toBeCloseTo(5.9, 1);
    expect(c.rangeDays![0]).toBeCloseTo(4, 5);
    expect(c.rangeDays![1]).toBeCloseTo(7.33, 2);
    expect(c.next!.likely).toBeGreaterThanOrEqual(c.next!.from);
    expect(c.next!.likely).toBeLessThanOrEqual(c.next!.to);
    expect(c.confidence).toBe('medium');
  });

  it('follows a change of rhythm', () => {
    // Monthly for most of a year, then weekly lately.
    const monthly = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270];
    const weekly = Array.from({ length: 9 }, (_, i) => 277 + i * 7);
    const days = [...monthly, ...weekly];
    const c = computeCadence(entries(...days), new Date(BASE + 335 * DAY));
    expect(c.typicalDays).toBeCloseTo(7, 5);
    // A plain median of the same gaps would still say about three weeks.
    const sorted = days
      .slice(1)
      .map((d, i) => d - days[i]!)
      .sort((a, b) => a - b);
    expect(quantile(sorted, 0.5)).toBeGreaterThan(18);
  });

  it('leans toward the weekday an app usually ships on', () => {
    // Every Monday, with an occasional extra day: gaps of 7 and 8 days.
    const days = [0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 71, 77, 84];
    const c = computeCadence(entries(...days), new Date(BASE + 85 * DAY));
    expect(new Date(c.next!.likely).getUTCDay()).toBe(new Date(BASE).getUTCDay());
  });

  it('rates a steady, long record as high confidence', () => {
    const days = Array.from({ length: 11 }, (_, i) => i * 14);
    const c = computeCadence(entries(...days), new Date(BASE + 141 * DAY));
    expect(c.sample).toBe(10);
    expect(c.confidence).toBe('high');
    expect(c.last30).toBe(3);
  });

  it('weights recent gaps and merges same-release re-posts', () => {
    const days = [0, 60, 120, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192];
    const c = computeCadence(entries(...days, 192.01), new Date(BASE + 193 * DAY));
    expect(c.releases).toHaveLength(days.length + 1); // every release is listed…
    expect(c.gaps).toHaveLength(days.length - 1); // …but the re-post adds no gap
    expect(c.sample).toBe(15);
    expect(c.typicalDays).toBeCloseTo(1, 5);
  });

  it('falls back to detection time when there is no release date', () => {
    const history = entries(0, 5, 10, 15).map((e) => ({ ...e, releaseDate: null }));
    const c = computeCadence(history, new Date(BASE + 16 * DAY));
    expect(c.typicalDays).toBeCloseTo(5);
  });
});

describe('wording helpers', () => {
  it('describes gaps in friendly units', () => {
    expect(describeDays(0.25)).toBe('6 hours');
    expect(describeDays(1)).toBe('1 day');
    expect(describeDays(6.6)).toBe('7 days');
    expect(describeDays(21)).toBe('about 3 weeks');
    expect(describeDays(90)).toBe('about 3 months');
  });

  it('names nearby days', () => {
    const now = new Date('2026-10-21T12:00:00');
    expect(relativeDay(Date.parse('2026-10-21T23:00:00'), now)).toBe('today');
    expect(relativeDay(Date.parse('2026-10-22T01:00:00'), now)).toBe('tomorrow');
    expect(relativeDay(Date.parse('2026-10-25T08:00:00'), now)).toBe('in 4 days');
    expect(relativeDay(Date.parse('2026-10-19T08:00:00'), now)).toBe('2 days ago');
  });

  it('summarises a rhythm in one line', () => {
    const history = entries(0, 7, 14, 21, 28);
    expect(
      rhythmLine(computeCadence(history, new Date(BASE + 30 * DAY)), new Date(BASE + 30 * DAY)),
    ).toBe('Updates every ~7 days · next in ~5 days');
    expect(rhythmLine(computeCadence(history, new Date(BASE + 35 * DAY)))).toBe(
      'Updates every ~7 days · due now',
    );
    expect(rhythmLine(computeCadence(entries(0, 1)))).toBeNull();
  });

  it('describes ranges compactly', () => {
    expect(describeRange(4, 7)).toBe('4–7 days');
    expect(describeRange(21, 49)).toBe('3–7 weeks');
    expect(describeRange(6, 21)).toBe('6 days–3 weeks');
  });

  it('orders due, then upcoming, then late, then unknown', () => {
    const history = entries(0, 7, 14, 21, 28);
    const due = computeCadence(history, new Date(BASE + 35 * DAY));
    const upcoming = computeCadence(history, new Date(BASE + 30 * DAY));
    const late = computeCadence(history, new Date(BASE + 60 * DAY));
    const keys = [late, upcoming, null, due].map(nextSortTime);
    expect([...keys].sort((a, b) => a - b)).toEqual([
      nextSortTime(due),
      nextSortTime(upcoming),
      nextSortTime(late),
      Number.POSITIVE_INFINITY,
    ]);
  });

  it('sorts unknown rhythms last', () => {
    expect(nextSortTime(null)).toBe(Number.POSITIVE_INFINITY);
    const c = computeCadence(entries(0, 7, 14, 21), new Date(BASE + 22 * DAY));
    expect(nextSortTime(c)).toBe(c.next?.likely);
  });
});
