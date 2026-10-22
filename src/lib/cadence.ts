/**
 * Release rhythm: how often a listing ships updates and when the next one is
 * most likely, estimated from its recorded release history.
 *
 * Apps don't publish schedules, so this is an estimate from past behavior,
 * tuned by backtesting against the release histories AppWatch has recorded
 * (asking "what would we have predicted after each past release?" and
 * comparing with when the next one really came):
 *
 *  - It looks at the gaps between the most recent releases (up to 24),
 *    weighting recent gaps more (each gap counts half as much as one eight
 *    releases newer), so a changed rhythm is picked up.
 *  - Gaps are compared on a log scale, so one long pause doesn't drag the
 *    estimate the way it would on a plain average.
 *  - The window is the middle half of those weighted gaps after the last
 *    release; the likely day inside it leans toward the weekdays the app
 *    usually ships on.
 *
 * Predictions need at least MIN_GAPS gaps. `backtestCadence` reports how well
 * the estimate has done for a given listing.
 */

import type { VersionHistoryEntry } from '../shared/types.ts';

export const MIN_GAPS = 3;
/** Only the most recent gaps count, so a changed rhythm is picked up. */
const RECENT_GAPS = 24;
/** A gap counts half as much as the one this many releases newer. */
const HALF_LIFE_GAPS = 8;
/** How strongly the likely day leans toward the app's usual release weekdays. */
const WEEKDAY_WEIGHT = 1;
/** …but only moves it this many days from where the gaps cluster. */
const WEEKDAY_REACH = 3.5;
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

/** Recorded releases, oldest first. */
function releasesOf(entries: readonly VersionHistoryEntry[]): Release[] {
  const releases: Release[] = [];
  for (const entry of [...entries].sort((a, b) => releaseTime(a) - releaseTime(b))) {
    const time = releaseTime(entry);
    if (!Number.isNaN(time)) releases.push({ time, version: entry.version });
  }
  return releases;
}

/**
 * Gaps between releases. A release within an hour of the previous one (a
 * same-day re-post, or posts migrated with one shared date) adds no gap.
 */
function gapsOf(releases: readonly Release[]): Gap[] {
  const gaps: Gap[] = [];
  let anchor: Release | null = null;
  for (const release of releases) {
    if (anchor && release.time - anchor.time >= SAME_RELEASE_MS) {
      gaps.push({ days: (release.time - anchor.time) / DAY, from: anchor, to: release });
    }
    if (!anchor || release.time - anchor.time >= SAME_RELEASE_MS) anchor = release;
  }
  return gaps;
}

/** Weighted quantile with midpoint interpolation (equal weights give the usual quantile). */
export function weightedQuantile(
  values: readonly number[],
  weights: readonly number[],
  q: number,
): number {
  if (values.length === 0) return Number.NaN;
  const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let seen = 0;
  const points = order.map((i) => {
    const point = { p: (seen + weights[i]! / 2) / total, v: values[i]! };
    seen += weights[i]!;
    return point;
  });
  if (q <= points[0]!.p) return points[0]!.v;
  for (let k = 1; k < points.length; k++) {
    const b = points[k]!;
    if (q <= b.p) {
      const a = points[k - 1]!;
      return a.v + ((b.v - a.v) * (q - a.p)) / (b.p - a.p);
    }
  }
  return points[points.length - 1]!.v;
}

interface Estimate {
  typical: number;
  low: number;
  high: number;
  /** Days after the last release the next one is most likely. */
  likely: number;
  spread: number;
}

/** The core estimate, in days after the last release. */
function estimate(recent: readonly Gap[], releases: readonly Release[]): Estimate {
  const values = recent.map((gap) => gap.days);
  const weights = values.map((_, i) => 0.5 ** ((values.length - 1 - i) / HALF_LIFE_GAPS));
  const logs = values.map((days) => Math.log(Math.max(days, 1 / 24)));
  const typical = Math.exp(weightedQuantile(logs, weights, 0.5));
  let low = Math.exp(weightedQuantile(logs, weights, 0.25));
  let high = Math.exp(weightedQuantile(logs, weights, 0.75));
  const spread = typical > 0 ? (high - low) / typical : Number.POSITIVE_INFINITY;
  // Keep the window at least a day wide around the typical gap.
  if (high - low < 1) {
    low = Math.max(0, typical - 0.5);
    high = typical + 0.5;
  }
  return { typical, low, high, likely: likelyDay(values, weights, low, high, releases), spread };
}

/**
 * The most likely point in the window: where the recent gaps cluster,
 * nudged toward the weekdays this app usually releases on (many ship on
 * weekdays only, or on a fixed day). Falls back to the window's middle.
 */
function likelyDay(
  values: readonly number[],
  weights: readonly number[],
  low: number,
  high: number,
  releases: readonly Release[],
): number {
  const last = releases[releases.length - 1];
  if (!last) return (low + high) / 2;
  const counts = new Array<number>(7).fill(1); // add-one smoothing
  const sample = releases.slice(-30);
  for (const release of sample) counts[new Date(release.time).getUTCDay()]! += 1;
  const total = sample.length + 7;
  const width = Math.max(0.5, (high - low) / 2);
  const density = (day: number) =>
    values.reduce(
      (sum, value, i) => sum + weights[i]! * Math.exp(-0.5 * ((day - value) / width) ** 2),
      0,
    );
  // 1. Where the recent gaps cluster.
  const step = Math.max(0.25, (high - low) / 160);
  let peak = (low + high) / 2;
  let peakDensity = Number.NEGATIVE_INFINITY;
  for (let day = Math.max(0, low); day <= high + 1e-9; day += step) {
    const d = density(day);
    if (d > peakDensity) {
      peakDensity = d;
      peak = day;
    }
  }
  if (releases.length < 6) return peak;
  // 2. Within a few days of that, the day the app most often ships on.
  let best = peak;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (
    let day = Math.max(0, low, peak - WEEKDAY_REACH);
    day <= Math.min(high, peak + WEEKDAY_REACH) + 1e-9;
    day += 0.25
  ) {
    const weekday = new Date(last.time + day * DAY).getUTCDay();
    const score =
      Math.log(density(day) + 1e-12) + WEEKDAY_WEIGHT * Math.log((counts[weekday]! / total) * 7);
    if (score > bestScore) {
      bestScore = score;
      best = day;
    }
  }
  return best;
}

export function computeCadence(
  entries: readonly VersionHistoryEntry[],
  now: Date = new Date(),
): Cadence {
  const releases = releasesOf(entries);
  const gaps = gapsOf(releases);
  const nowMs = now.getTime();
  const last = releases[releases.length - 1] ?? null;
  const last30 = releases.filter((r) => r.time <= nowMs && nowMs - r.time <= 30 * DAY).length;
  const weekday = dominantWeekday(releases);

  const recent = gaps.slice(-RECENT_GAPS);
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

  const { typical, low, high, likely, spread } = estimate(recent, releases);
  const next = {
    from: last.time + low * DAY,
    likely: last.time + likely * DAY,
    to: last.time + high * DAY,
  };
  const state: RhythmState = nowMs < next.from ? 'upcoming' : nowMs <= next.to ? 'due' : 'overdue';
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

export interface CadenceAccuracy {
  /** Past releases the estimate was checked against. */
  tests: number;
  /** How many landed inside the estimated window. */
  hits: number;
  /** Median distance between the likely day and the real release, in days. */
  medianErrorDays: number;
}

/**
 * How well the estimate has worked for this listing: for each of its recent
 * releases, the estimate made right after the release before it, compared
 * with when that release really came. Null with too little history.
 */
export function backtestCadence(
  entries: readonly VersionHistoryEntry[],
  maxTests = 20,
): CadenceAccuracy | null {
  const releases = releasesOf(entries);
  const gaps = gapsOf(releases);
  const errors: number[] = [];
  let hits = 0;
  for (let k = Math.max(MIN_GAPS, gaps.length - maxTests); k < gaps.length; k++) {
    const target = gaps[k]!;
    const history = gaps.slice(0, k);
    const before = releases.filter((r) => r.time <= target.from.time);
    const { low, high, likely } = estimate(history.slice(-RECENT_GAPS), before);
    const actual = target.days;
    if (actual >= low && actual <= high) hits += 1;
    errors.push(Math.abs(actual - likely));
  }
  if (errors.length < 3) return null;
  return {
    tests: errors.length,
    hits,
    medianErrorDays: quantile(
      [...errors].sort((a, b) => a - b),
      0.5,
    ),
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

/** One-line summary for cards: "Updates every ~6 days · next in ~3 days". */
export function rhythmLine(cadence: Cadence, now: Date = new Date()): string | null {
  if (cadence.state === 'insufficient' || !cadence.typicalDays || !cadence.next) return null;
  const every = `Updates every ~${describeDays(cadence.typicalDays).replace(/^about /, '')}`;
  switch (cadence.state) {
    case 'upcoming':
      return `${every} · next ${relativeDay(cadence.next.likely, now).replace(/^in /, 'in ~')}`;
    case 'due':
      return `${every} · due now`;
    case 'overdue':
      return `${every} · overdue`;
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
