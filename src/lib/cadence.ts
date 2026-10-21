/**
 * Release rhythm: how often a listing ships updates and when the next one is
 * most likely, estimated from its recorded release history.
 *
 * This is an honest, simple estimate — apps don't publish schedules. It looks
 * at the gaps between recent releases, takes the median as the typical gap
 * and the middle half of the gaps (25th–75th percentile) as the likely
 * window after the last release. Predictions need at least MIN_GAPS gaps.
 */

import type { VersionHistoryEntry } from '../shared/types.ts';

export const MIN_GAPS = 3;
/** Only the most recent gaps count, so a changed rhythm is picked up. */
const RECENT_GAPS = 12;
const DAY = 86_400_000;
/** Releases closer together than this are treated as one (e.g. a same-day re-post). */
const SAME_RELEASE_MS = 60 * 60 * 1000;

export interface Release {
  time: number;
  version: string | null;
}

export interface Gap {
  /** Days between `from` and `to`. */
  days: number;
  from: Release;
  to: Release;
}

export type RhythmState = 'insufficient' | 'upcoming' | 'due' | 'overdue';

export interface Cadence {
  /** All recorded releases, oldest first. */
  releases: Release[];
  /** Gaps between consecutive releases, oldest first. */
  gaps: Gap[];
  /** How many of the most recent gaps the estimate uses. */
  sample: number;
  /** Median gap in days. */
  typicalDays: number | null;
  /** 25th–75th percentile gap in days. */
  rangeDays: [number, number] | null;
  last: Release | null;
  /** Likely window for the next release (epoch ms). */
  next: { from: number; likely: number; to: number } | null;
  state: RhythmState;
  confidence: 'low' | 'medium' | 'high' | null;
  /** Releases in the 30 days before `now`. */
  last30: number;
  /** Weekday (0 = Sunday) most releases land on, when there's a clear one. */
  weekday: { day: number; share: number } | null;
}

/** Linear-interpolated quantile of an ascending list. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  const a = sorted[lower]!;
  const b = sorted[upper]!;
  return a + (b - a) * (pos - lower);
}

function releaseTime(entry: VersionHistoryEntry): number {
  return Date.parse(entry.releaseDate ?? entry.detectedAt);
}

export function computeCadence(
  entries: readonly VersionHistoryEntry[],
  now: Date = new Date(),
): Cadence {
  const releases: Release[] = [];
  for (const entry of [...entries].sort((a, b) => releaseTime(a) - releaseTime(b))) {
    const time = releaseTime(entry);
    if (!Number.isNaN(time)) releases.push({ time, version: entry.version });
  }

  // Gaps skip releases that land within an hour of the previous one (a
  // same-day re-post, or posts migrated with one shared date).
  const gaps: Gap[] = [];
  let anchor: Release | null = null;
  for (const release of releases) {
    if (anchor && release.time - anchor.time >= SAME_RELEASE_MS) {
      gaps.push({ days: (release.time - anchor.time) / DAY, from: anchor, to: release });
    }
    if (!anchor || release.time - anchor.time >= SAME_RELEASE_MS) anchor = release;
  }

  const nowMs = now.getTime();
  const last = releases[releases.length - 1] ?? null;
  const last30 = releases.filter((r) => r.time <= nowMs && nowMs - r.time <= 30 * DAY).length;
  const weekday = dominantWeekday(releases);

  const recent = gaps.slice(-RECENT_GAPS).map((gap) => gap.days);
  if (recent.length < MIN_GAPS || !last) {
    return {
      releases,
      gaps,
      sample: recent.length,
      typicalDays: null,
      rangeDays: null,
      last,
      next: null,
      state: 'insufficient',
      confidence: null,
      last30,
      weekday,
    };
  }

  const sorted = [...recent].sort((a, b) => a - b);
  const typical = quantile(sorted, 0.5);
  let low = quantile(sorted, 0.25);
  let high = quantile(sorted, 0.75);
  // Keep the window at least a day wide around the typical gap.
  if (high - low < 1) {
    low = Math.max(0, typical - 0.5);
    high = typical + 0.5;
  }
  const next = {
    from: last.time + low * DAY,
    likely: last.time + typical * DAY,
    to: last.time + high * DAY,
  };
  const state: RhythmState = nowMs < next.from ? 'upcoming' : nowMs <= next.to ? 'due' : 'overdue';

  const spread = typical > 0 ? (high - low) / typical : Number.POSITIVE_INFINITY;
  const confidence =
    recent.length >= 8 && spread <= 0.75
      ? 'high'
      : recent.length >= 5 && spread <= 1.5
        ? 'medium'
        : 'low';

  return {
    releases,
    gaps,
    sample: recent.length,
    typicalDays: typical,
    rangeDays: [low, high],
    last,
    next,
    state,
    confidence,
    last30,
    weekday,
  };
}

function dominantWeekday(releases: readonly Release[]): Cadence['weekday'] {
  if (releases.length < 5) return null;
  const counts = new Array<number>(7).fill(0);
  for (const release of releases) counts[new Date(release.time).getDay()]! += 1;
  let day = 0;
  for (let d = 1; d < 7; d++) if (counts[d]! > counts[day]!) day = d;
  const share = counts[day]! / releases.length;
  return share >= 0.4 ? { day, share } : null;
}

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

/** "today", "tomorrow", "in 3 days", "3 days ago". */
export function relativeDay(time: number, now: Date = new Date()): string {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diff = Math.round((startOfDay(time) - startOfDay(now.getTime())) / DAY);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/** One-line summary for cards: "Every ~6 days · next in ~3 days". */
export function rhythmLine(cadence: Cadence, now: Date = new Date()): string | null {
  if (cadence.state === 'insufficient' || !cadence.typicalDays || !cadence.next) return null;
  const every = `Every ~${describeDays(cadence.typicalDays).replace(/^about /, '')}`;
  switch (cadence.state) {
    case 'upcoming':
      return `${every} · next ${relativeDay(cadence.next.likely, now).replace(/^in /, 'in ~')}`;
    case 'due':
      return `${every} · due now`;
    case 'overdue':
      return `${every} · later than usual`;
    default:
      return null;
  }
}

/**
 * Sort key for "Next expected update": apps inside their window first, then
 * upcoming ones by their likely date, then late ones, then unknown.
 */
export function nextSortTime(cadence: Cadence | null | undefined): number {
  if (!cadence?.next) return Number.POSITIVE_INFINITY;
  switch (cadence.state) {
    case 'due':
      return cadence.next.likely - 1e13;
    case 'overdue':
      return 1e14 + cadence.next.to;
    default:
      return cadence.next.likely;
  }
}

/** "5–9 days", "3–7 weeks", "6 days–about 3 weeks". */
export function describeRange(low: number, high: number): string {
  const a = describeDays(low).replace(/^about /, '');
  const b = describeDays(high).replace(/^about /, '');
  const [an, au] = a.split(' ');
  const [bn, bu] = b.split(' ');
  if (au && bu && au.replace(/s$/, '') === bu.replace(/s$/, '')) return `${an}–${bn} ${bu}`;
  return `${a}–${b}`;
}
