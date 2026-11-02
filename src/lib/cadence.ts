/**
 * Release rhythm for the site: how often a listing updates and when the next
 * update is likely, from its recorded releases and the learned forecast
 * settings (src/shared/forecast.ts; re-trained by the checker on every run
 * that records something new).
 */

import type { Distribution, ForecastModel, Release, TrackRecord } from '../shared/forecast.ts';
import {
  DAY_MS,
  DEFAULT_MODEL,
  distinctTimes,
  elapsedBand,
  FORECAST_TARGET,
  forecastWindow,
  gapDistribution,
  gapShape,
  gapsBetween,
  LATE_SURVIVAL,
  MIN_GAPS,
  OVERDUE_SURVIVAL,
  RECENT_GAPS,
  releasesOf,
  trackRecord,
} from '../shared/forecast.ts';
import type { ForecastModelFile, LiveRecord, VersionHistoryEntry } from '../shared/types.ts';

export { MIN_GAPS, weightedQuantile } from '../shared/forecast.ts';
export type { Release, TrackRecord } from '../shared/forecast.ts';

export interface Gap {
  /** Days between `from` and `to`. */
  days: number;
  from: Release;
  to: Release;
}

/**
 * - insufficient: too few releases to forecast
 * - upcoming: the expected window is ahead
 * - due: the expected window has started
 * - late: it has been longer than most gaps, but the rhythm still holds
 * - overdue: longer than any recent gap; no forecast until the next release
 */
export type RhythmState = 'insufficient' | 'upcoming' | 'due' | 'late' | 'overdue';

export interface Cadence {
  /** All recorded releases, oldest first. */
  releases: Release[];
  /** Gaps between distinct releases, oldest first. */
  gaps: Gap[];
  /** Typical gap in days (recent gaps weighted more). */
  typicalDays: number | null;
  /** The middle half of recent gaps, in days. */
  rangeDays: [number, number] | null;
  last: Release | null;
  /** The expected window and day for the next release (epoch ms). */
  next: { from: number; likely: number; to: number } | null;
  /** The chance the next release lands in `next` (e.g. 2/3), as calibrated by training. */
  chance: number;
  state: RhythmState;
  /** Releases in the 30 days before `now`. */
  last30: number;
  /** Local weekday (0 = Sunday) most releases land on, when there's a clear one. */
  weekday: { day: number; share: number } | null;
  /** Days since the last release. */
  elapsedDays: number;
  /** The full forecast (for drawing), or null with too little history. */
  distribution: Distribution | null;
}

/** Turn the learned model file into the settings for one listing. */
export function modelForListing(file: ForecastModelFile | null, id: string): ForecastModel {
  if (!file) return DEFAULT_MODEL;
  return {
    params: file.listings[id]?.params ?? file.params,
    masses: file.masses,
    target: file.target,
  };
}

export function liveRecordFor(file: ForecastModelFile | null, id: string): LiveRecord | null {
  return file?.listings[id]?.live ?? null;
}

function gapsOf(releases: readonly Release[]): Gap[] {
  const gaps: Gap[] = [];
  let anchor: Release | null = null;
  for (const release of releases) {
    if (anchor && release.time - anchor.time >= 3_600_000) {
      gaps.push({ days: (release.time - anchor.time) / DAY_MS, from: anchor, to: release });
    }
    if (!anchor || release.time - anchor.time >= 3_600_000) anchor = release;
  }
  return gaps;
}

function dominantWeekday(times: readonly number[]): Cadence['weekday'] {
  const sample = times.slice(-30);
  if (sample.length < 6) return null;
  const counts = new Array<number>(7).fill(0);
  // Local weekdays: this is what readers see ("usually ships on Tuesdays").
  for (const time of sample) counts[new Date(time).getDay()]! += 1;
  let day = 0;
  for (let d = 1; d < 7; d++) if (counts[d]! > counts[day]!) day = d;
  const share = counts[day]! / sample.length;
  return share >= 0.35 ? { day, share } : null;
}

export function computeCadence(
  entries: readonly VersionHistoryEntry[],
  now: Date = new Date(),
  model: ForecastModel = DEFAULT_MODEL,
): Cadence {
  const releases = releasesOf(entries);
  const gaps = gapsOf(releases);
  const times = distinctTimes(releases);
  const nowMs = now.getTime();
  const last = releases[releases.length - 1] ?? null;
  const elapsedDays = last ? Math.max(0, (nowMs - last.time) / DAY_MS) : 0;
  const base = {
    releases,
    gaps,
    last,
    chance: model.target,
    last30: releases.filter((r) => r.time <= nowMs && nowMs - r.time <= 30 * DAY_MS).length,
    weekday: dominantWeekday(times),
    elapsedDays,
  };

  const recent = gapsBetween(times).slice(-RECENT_GAPS);
  if (recent.length < MIN_GAPS || !last) {
    return {
      ...base,
      typicalDays: null,
      rangeDays: null,
      next: null,
      state: 'insufficient',
      distribution: null,
    };
  }

  const shape = gapShape(recent, model.params.halfLife);
  const distribution = gapDistribution(recent, times, model.params);
  const lastTime = times[times.length - 1]!;
  const elapsed = Math.max(0, (nowMs - lastTime) / DAY_MS);
  const band = elapsedBand(elapsed, shape.typical);
  const mass = model.masses[band] ?? FORECAST_TARGET;
  const window = forecastWindow(distribution, mass, elapsed);
  const rangeDays: [number, number] = [shape.low, shape.high];

  if (!window || window.survival < OVERDUE_SURVIVAL) {
    return {
      ...base,
      typicalDays: shape.typical,
      rangeDays,
      next: null,
      state: 'overdue',
      distribution,
    };
  }

  const next = {
    from: lastTime + window.from * DAY_MS,
    likely: lastTime + window.point * DAY_MS,
    to: lastTime + window.to * DAY_MS,
  };
  const state: RhythmState =
    window.survival < LATE_SURVIVAL ? 'late' : next.from - nowMs > DAY_MS / 2 ? 'upcoming' : 'due';
  return {
    ...base,
    typicalDays: shape.typical,
    rangeDays,
    next,
    state,
    distribution,
  };
}

/** How the forecast would have done on this listing's recent releases. */
export function trackRecordFor(
  entries: readonly VersionHistoryEntry[],
  model: ForecastModel = DEFAULT_MODEL,
): TrackRecord | null {
  return trackRecord(distinctTimes(releasesOf(entries)), model);
}

/* --------------------------------- Words --------------------------------- */

/** "6 days", "about 2 weeks", "1 day", "12 hours". */
export function describeDays(days: number): string {
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (days < 13.5) {
    const d = Math.round(days);
    return `${d} day${d === 1 ? '' : 's'}`;
  }
  if (days < 60) {
    const w = Math.round(days / 7);
    return `about ${w} weeks`;
  }
  const m = Math.round(days / 30.44);
  return `about ${m} month${m === 1 ? '' : 's'}`;
}

/** "5–9 days", "3–7 weeks", "6 days–about 3 weeks". */
export function describeRange(low: number, high: number): string {
  const a = describeDays(low).replace(/^about /, '');
  const b = describeDays(high).replace(/^about /, '');
  const [an, au] = a.split(' ');
  const [bn, bu] = b.split(' ');
  if (au && bu && au.replace(/s$/, '') === bu.replace(/s$/, '')) {
    return an === bn ? b : `${an}–${bn} ${bu}`;
  }
  return `${a}–${b}`;
}

/** "today", "tomorrow", "in 3 days", "3 days ago". */
export function relativeDay(time: number, now: Date = new Date()): string {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diff = Math.round((startOfDay(time) - startOfDay(now.getTime())) / DAY_MS);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/** Short "when" for lists: "Likely today", "In ~3 days", "Later than usual". */
export function whenLabel(cadence: Cadence, now: Date = new Date()): string | null {
  if (!cadence.next) return cadence.state === 'overdue' ? 'Overdue' : null;
  if (cadence.state === 'late') return 'Later than usual';
  const day = relativeDay(cadence.next.likely, now);
  if (day === 'today') return 'Likely today';
  if (day === 'tomorrow') return 'Likely tomorrow';
  return day.replace(/^in /, 'In ~');
}

/**
 * Sort key for "Next update": by the expected day (every forecast is ahead
 * of now), then overdue listings, then unknown.
 */
export function nextSortTime(cadence: Cadence | null | undefined): number {
  if (!cadence) return Number.POSITIVE_INFINITY;
  if (cadence.next) return cadence.next.likely;
  if (cadence.state === 'overdue' && cadence.last) return 1e14 + cadence.last.time;
  return Number.POSITIVE_INFINITY;
}
