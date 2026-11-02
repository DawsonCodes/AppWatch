import { describe, expect, it } from 'vitest';
import {
  computeCadence,
  describeDays,
  describeRange,
  liveRecordFor,
  modelForListing,
  nextSortTime,
  relativeDay,
  trackRecordFor,
  whenLabel,
} from '../src/lib/cadence.ts';
import { DEFAULT_MODEL, DEFAULT_PARAMS } from '../src/shared/forecast.ts';
import type { ForecastModelFile, VersionHistoryEntry } from '../src/shared/types.ts';

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

const at = (days: number) => new Date(BASE + days * DAY);
const days = (time: number) => (time - BASE) / DAY;

describe('computeCadence', () => {
  it('needs at least three gaps before forecasting', () => {
    const c = computeCadence(entries(0, 7, 14), at(15));
    expect(c.state).toBe('insufficient');
    expect(c.next).toBeNull();
    expect(c.distribution).toBeNull();
    expect(c.gaps).toHaveLength(2);
    expect(c.last?.version).toBe('1.2');
  });

  it('forecasts a weekly rhythm', () => {
    const c = computeCadence(entries(0, 7, 14, 21, 28), at(30));
    expect(c.typicalDays).toBeCloseTo(7, 5);
    expect(c.state).toBe('upcoming');
    expect(days(c.next!.likely)).toBeCloseTo(35, 0);
    expect(days(c.next!.from)).toBeGreaterThan(30);
    expect(days(c.next!.from)).toBeLessThan(35);
    expect(days(c.next!.to)).toBeGreaterThan(35);
    expect(c.chance).toBeCloseTo(2 / 3, 5);
  });

  it('keeps the window ahead of now while waiting, then calls it late and overdue', () => {
    const history = entries(0, 7, 14, 21, 28);
    const waiting = computeCadence(history, at(35));
    expect(waiting.state).toBe('due');
    expect(waiting.next!.from).toBeGreaterThanOrEqual(at(35).getTime());
    expect(waiting.next!.likely).toBeGreaterThan(at(35).getTime());
    expect(computeCadence(history, at(40)).state).toBe('late');
    const overdue = computeCadence(history, at(60));
    expect(overdue.state).toBe('overdue');
    expect(overdue.next).toBeNull();
    expect(overdue.typicalDays).toBeCloseTo(7, 5);
  });

  it('reports the middle half of recent gaps, weighted to the newest', () => {
    const c = computeCadence(entries(0, 3, 10, 14, 24, 28, 35), at(36));
    // gaps: 3, 7, 4, 10, 4, 7 (newest last); a plain median would be 5.5
    expect(c.typicalDays).toBeCloseTo(5.9, 1);
    expect(c.rangeDays![0]).toBeCloseTo(4, 5);
    expect(c.rangeDays![1]).toBeCloseTo(7.33, 2);
    expect(c.next!.likely).toBeGreaterThanOrEqual(c.next!.from);
    expect(c.next!.likely).toBeLessThanOrEqual(c.next!.to);
  });

  it('follows a change of rhythm', () => {
    // Monthly for most of a year, then weekly lately.
    const monthly = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270];
    const weekly = Array.from({ length: 9 }, (_, i) => 277 + i * 7);
    const c = computeCadence(entries(...monthly, ...weekly), at(335));
    expect(c.typicalDays).toBeCloseTo(7, 5);
    expect(days(c.next!.likely)).toBeLessThan(335 + 14);
  });

  it('leans toward the weekday an app usually ships on', () => {
    // Every Monday, with an occasional extra day: gaps of 7 and 8 days.
    const c = computeCadence(entries(0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 71, 77, 84), at(85));
    expect(new Date(c.next!.likely).getUTCDay()).toBe(new Date(BASE).getUTCDay());
    expect(c.weekday?.day).toBe(new Date(BASE).getDay());
  });

  it('merges same-release re-posts and counts the last 30 days', () => {
    const list = [0, 60, 120, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192];
    const c = computeCadence(entries(...list, 192.01), at(193));
    expect(c.releases).toHaveLength(list.length + 1); // every release is listed…
    expect(c.gaps).toHaveLength(list.length - 1); // …but the re-post adds no gap
    expect(c.typicalDays).toBeCloseTo(1, 5);
    expect(c.last30).toBe(14); // releases (re-posts included) since day 163
  });

  it('falls back to detection time when there is no release date', () => {
    const history = entries(0, 5, 10, 15).map((e) => ({ ...e, releaseDate: null }));
    const c = computeCadence(history, at(16));
    expect(c.typicalDays).toBeCloseTo(5);
  });

  it('uses learned settings when given', () => {
    const history = entries(0, 3, 10, 14, 24, 28, 35);
    const wide = computeCadence(history, at(36), {
      ...DEFAULT_MODEL,
      masses: [0.9, 0.9, 0.9, 0.9],
    });
    const narrow = computeCadence(history, at(36), {
      ...DEFAULT_MODEL,
      masses: [0.4, 0.4, 0.4, 0.4],
    });
    expect(wide.next!.to - wide.next!.from).toBeGreaterThan(narrow.next!.to - narrow.next!.from);
  });
});

describe('learned model lookups', () => {
  const file: ForecastModelFile = {
    schemaVersion: 1,
    trainedAt: '2026-11-01T00:00:00.000Z',
    target: 0.7,
    params: { halfLife: 16, bandwidth: 0.3, weekday: 1 },
    masses: [0.6, 0.6, 0.6, 0.6],
    listings: {
      'apple:1': { params: { halfLife: 4, bandwidth: 0.2, weekday: 0 } },
      'apple:2': { live: { forecasts: 4, hits: 3, medianErrorDays: 1.2 } },
    },
    replay: { tests: 10, hits: 7, medianErrorDays: 1 },
    live: null,
  };

  it('picks per-listing settings, falling back to the shared ones', () => {
    expect(modelForListing(file, 'apple:1').params.halfLife).toBe(4);
    expect(modelForListing(file, 'apple:2').params.halfLife).toBe(16);
    expect(modelForListing(file, 'apple:2').target).toBe(0.7);
    expect(modelForListing(null, 'apple:1').params).toEqual(DEFAULT_PARAMS);
  });

  it('reads the live record', () => {
    expect(liveRecordFor(file, 'apple:2')?.hits).toBe(3);
    expect(liveRecordFor(file, 'apple:1')).toBeNull();
    expect(liveRecordFor(null, 'apple:2')).toBeNull();
  });
});

describe('trackRecordFor', () => {
  it('scores a steady rhythm as accurate', () => {
    const record = trackRecordFor(entries(...Array.from({ length: 12 }, (_, i) => i * 7)));
    expect(record).not.toBeNull();
    expect(record!.tests).toBe(8); // gaps 4..11 each checked against the gaps before
    expect(record!.hits).toBe(8);
    expect(record!.medianErrorDays).toBeLessThan(0.5);
  });

  it('scores an erratic one as inaccurate, and needs some history', () => {
    const record = trackRecordFor(entries(0, 1, 15, 16, 40, 41, 80, 81, 130));
    expect(record!.hits).toBeLessThan(record!.tests);
    expect(record!.medianErrorDays).toBeGreaterThan(5);
    expect(trackRecordFor(entries(0, 7, 14, 21))).toBeNull();
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

  it('describes ranges compactly', () => {
    expect(describeRange(4, 7)).toBe('4–7 days');
    expect(describeRange(21, 49)).toBe('3–7 weeks');
    expect(describeRange(6, 21)).toBe('6 days–3 weeks');
    expect(describeRange(7, 7.2)).toBe('7 days');
  });

  it('labels when an update is expected', () => {
    const history = entries(0, 7, 14, 21, 28);
    expect(whenLabel(computeCadence(history, at(30)), at(30))).toBe('In ~5 days');
    expect(whenLabel(computeCadence(history, at(40)), at(40))).toBe('Later than usual');
    expect(whenLabel(computeCadence(history, at(60)), at(60))).toBe('Overdue');
    expect(whenLabel(computeCadence(entries(0, 1)))).toBeNull();
  });

  it('sorts by the expected day, then overdue, then unknown', () => {
    const history = entries(0, 7, 14, 21, 28);
    const soon = computeCadence(history, at(30));
    const later = computeCadence(entries(0, 7, 14, 21, 30), at(31));
    const overdue = computeCadence(history, at(60));
    const keys = [overdue, null, later, soon].map(nextSortTime);
    expect([...keys].sort((a, b) => a - b)).toEqual([
      nextSortTime(soon),
      nextSortTime(later),
      nextSortTime(overdue),
      Number.POSITIVE_INFINITY,
    ]);
    expect(nextSortTime(soon)).toBe(soon.next?.likely);
  });
});
