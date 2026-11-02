import { describe, expect, it } from 'vitest';
import {
  modelFor,
  recordForecasts,
  scoreForecasts,
  trainForecastModel,
} from '../scripts/lib/forecastTraining.ts';
import type { ForecastLogFile, ScoredForecast, VersionHistoryEntry } from '../src/shared/types.ts';
import { validateForecastLogFile, validateForecastModelFile } from '../src/shared/validate.ts';

const DAY = 86_400_000;
const BASE = Date.parse('2026-08-03T16:00:00Z');
const iso = (days: number) => new Date(BASE + days * DAY).toISOString();

function entries(...days: number[]): VersionHistoryEntry[] {
  return days
    .map((d, i) => ({
      version: `1.${i}`,
      releaseDate: iso(d),
      releaseNotes: null,
      detectedAt: iso(d + 0.05),
    }))
    .reverse();
}

const weekly = (count: number, jitter = 0) =>
  entries(...Array.from({ length: count }, (_, i) => i * 7 + (i % 3) * jitter));

const HISTORY: Record<string, VersionHistoryEntry[]> = {
  'apple:1': weekly(30),
  'apple:2': weekly(30, 1),
  'google:a': weekly(25, 0.5),
  'mac:homebrew:x': entries(0, 1, 15, 16, 40, 41, 80, 81, 130, 131, 160, 175, 176, 200, 230),
  'apple:short': entries(0, 7),
};

describe('trainForecastModel', () => {
  const model = trainForecastModel(HISTORY, null, { trainedAt: iso(300) });

  it('produces a valid model from the replayed history', () => {
    expect(validateForecastModelFile(model)).toEqual([]);
    expect(model.replay.tests).toBeGreaterThan(50);
    expect(model.replay.hits).toBeLessThanOrEqual(model.replay.tests);
    expect(model.masses).toHaveLength(4);
    expect(model.live).toBeNull();
    expect(model.target).toBeCloseTo(2 / 3, 3);
  });

  it('learns tight settings for regular rhythms', () => {
    expect(model.params.bandwidth).toBeLessThanOrEqual(0.3);
  });

  it('only stores per-listing settings that differ from the shared ones', () => {
    for (const entry of Object.values(model.listings)) {
      if (entry.params) expect(entry.params).not.toEqual(model.params);
    }
    expect(modelFor(model, 'apple:short').params).toEqual(model.params);
  });

  it('widens windows when real forecasts keep missing', () => {
    const misses: ScoredForecast[] = Array.from({ length: 40 }, (_, i) => ({
      madeAt: iso(i),
      after: iso(i),
      from: iso(i + 1),
      to: iso(i + 2),
      point: iso(i + 1.5),
      actual: iso(i + 9),
      hit: false,
      errorDays: 7.5,
    }));
    const log: ForecastLogFile = {
      schemaVersion: 1,
      listings: { 'apple:1': { open: null, scored: misses } },
    };
    const adjusted = trainForecastModel(HISTORY, log, { trainedAt: iso(300) });
    expect(adjusted.live).toEqual({ forecasts: 40, hits: 0, medianErrorDays: 7.5 });
    expect(adjusted.listings['apple:1']?.live?.forecasts).toBe(40);
    adjusted.masses.forEach((mass, band) => {
      expect(mass).toBeGreaterThanOrEqual(model.masses[band]!);
    });
    expect(adjusted.masses[0]).toBeGreaterThan(model.masses[0]!);
  });

  it('handles an empty history', () => {
    const empty = trainForecastModel({}, null, { trainedAt: iso(0) });
    expect(validateForecastModelFile(empty)).toEqual([]);
    expect(empty.replay.tests).toBe(0);
  });
});

describe('forecast log', () => {
  const model = trainForecastModel(HISTORY, null, { trainedAt: iso(300) });

  it('records a forecast for listings with enough history', () => {
    const now = new Date(BASE + (29 * 7 + 2) * DAY);
    const log = recordForecasts({ schemaVersion: 1, listings: {} }, HISTORY, model, now);
    expect(validateForecastLogFile(log)).toEqual([]);
    const open = log.listings['apple:1']!.open!;
    expect(open.madeAt).toBe(now.toISOString());
    expect(open.after).toBe(iso(29 * 7));
    expect(Date.parse(open.from)).toBeGreaterThanOrEqual(now.getTime());
    expect(Date.parse(open.point)).toBeGreaterThan(now.getTime());
    expect(log.listings['apple:short']).toBeUndefined();
  });

  it('scores a forecast once its release lands, then records a new one', () => {
    const now = new Date(BASE + (29 * 7 + 1) * DAY);
    const first = recordForecasts({ schemaVersion: 1, listings: {} }, HISTORY, model, now);
    const open = first.listings['apple:1']!.open!;

    const landed = { ...HISTORY, 'apple:1': weekly(31) };
    const scored = scoreForecasts(first, landed);
    const result = scored.listings['apple:1']!;
    expect(result.open).toBeNull();
    expect(result.scored).toHaveLength(1);
    expect(result.scored[0]!.actual).toBe(iso(30 * 7));
    expect(result.scored[0]!.hit).toBe(
      BASE + 30 * 7 * DAY >= Date.parse(open.from) && BASE + 30 * 7 * DAY <= Date.parse(open.to),
    );
    expect(result.scored[0]!.errorDays).toBeGreaterThanOrEqual(0);

    const next = recordForecasts(scored, landed, model, new Date(BASE + (30 * 7 + 1) * DAY));
    expect(next.listings['apple:1']!.open!.after).toBe(iso(30 * 7));
    expect(next.listings['apple:1']!.scored).toHaveLength(1);
    expect(validateForecastLogFile(next)).toEqual([]);
  });

  it('keeps waiting while no release has landed, and drops untracked listings', () => {
    const now = new Date(BASE + (29 * 7 + 1) * DAY);
    const log = recordForecasts({ schemaVersion: 1, listings: {} }, HISTORY, model, now);
    const again = scoreForecasts(log, HISTORY);
    expect(again.listings['apple:1']!.open).toEqual(log.listings['apple:1']!.open);
    const { 'apple:2': _removed, ...rest } = HISTORY;
    expect(scoreForecasts(log, rest).listings['apple:2']).toBeUndefined();
  });

  it('discards a forecast whose starting release disappeared', () => {
    const now = new Date(BASE + (29 * 7 + 1) * DAY);
    const log = recordForecasts({ schemaVersion: 1, listings: {} }, HISTORY, model, now);
    const corrected = { ...HISTORY, 'apple:1': weekly(29) };
    expect(scoreForecasts(log, corrected).listings['apple:1']).toBeUndefined();
  });
});
