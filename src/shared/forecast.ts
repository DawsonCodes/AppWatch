/**
 * Release forecasting: when is a listing's next update likely?
 *
 * Developers don't publish schedules, so AppWatch learns each listing's
 * rhythm from the release dates it has recorded:
 *
 *  1. The gaps between recent releases (up to 24) form a smooth distribution
 *     of "days until the next one". Gaps are compared on a log scale (a
 *     3-week pause after 3-day gaps is unusual, not a new normal) and recent
 *     gaps count more than old ones, so a changed rhythm is picked up.
 *  2. That distribution leans toward the weekdays the listing usually ships
 *     on (many apps never release at weekends; some always ship on Tuesday).
 *  3. The forecast is conditioned on the time already waited: if a listing
 *     usually updates every 5 days and it has been 7, the next update is
 *     still ahead, not "due" in a window that has already passed.
 *  4. The expected window is the shortest stretch of days holding the
 *     forecast's chance of the next release (about 2 in 3), and the expected
 *     day is its midpoint by probability.
 *
 * The settings (how fast old gaps fade, how smooth the distribution is, how
 * much weekdays matter) and the window sizes are not hand-picked: the update
 * checker re-learns them on every run from the full recorded history, by
 * replaying each listing's past ("what would we have forecast after each
 * release?") and keeping what forecast best. See scripts/lib/forecastTraining.ts.
 * As more releases are recorded, the settings and windows sharpen.
 */

import type { VersionHistoryEntry } from './types.ts';

export const DAY_MS = 86_400_000;
/** Releases closer together than this are one release (e.g. a same-day re-post). */
const SAME_RELEASE_MS = 3_600_000;
/** Forecasts need at least this many gaps (MIN_GAPS + 1 releases). */
export const MIN_GAPS = 3;
/** Only the most recent gaps count. */
export const RECENT_GAPS = 24;
/** The chance of the next release landing in the expected window. */
export const FORECAST_TARGET = 2 / 3;
/** Share of probability kept for surprises (a release far outside the usual rhythm). */
const SURPRISE = 0.02;
/** Surprises are spread evenly on a log scale between an hour and ~3 years. */
const SURPRISE_LOG_RANGE = Math.log(1100 * 24);
/** Below this chance of a release still to come, the rhythm has broken. */
export const OVERDUE_SURVIVAL = 0.04;
/** Below this chance, the next release is later than usual. */
export const LATE_SURVIVAL = 0.2;

export interface ForecastParams {
  /** A gap counts half as much as the one this many releases newer. */
  halfLife: number;
  /** Smoothing on the log-gap scale (0.3 ≈ ±35%). */
  bandwidth: number;
  /** How strongly the forecast leans toward usual release weekdays (0 = not at all). */
  weekday: number;
}

export const DEFAULT_PARAMS: ForecastParams = { halfLife: 8, bandwidth: 0.45, weekday: 1 };

/** Every combination the training tries. */
export const PARAM_GRID: readonly ForecastParams[] = (() => {
  const grid: ForecastParams[] = [];
  for (const halfLife of [4, 8, 16, 32]) {
    for (const bandwidth of [0.2, 0.3, 0.45, 0.6]) {
      for (const weekday of [0, 1]) grid.push({ halfLife, bandwidth, weekday });
    }
  }
  return grid;
})();

/**
 * Time already waited, in multiples of the typical gap, splits forecasts
 * into bands: [0, 0.5), [0.5, 1), [1, 1.5) and 1.5 or more. Each band has its
 * own window size, learned so the stated chance holds in that band.
 */
export const ELAPSED_BAND_EDGES: readonly number[] = [0.5, 1, 1.5];

/** Window sizes (share of probability) per band, before any training. */
export const DEFAULT_MASSES: readonly number[] = [0.67, 0.6, 0.62, 0.66];

export interface ForecastModel {
  params: ForecastParams;
  /** Probability mass the window holds, per elapsed band. */
  masses: readonly number[];
  /** The chance the windows are sized for (what readers are told). */
  target: number;
}

export const DEFAULT_MODEL: ForecastModel = {
  params: DEFAULT_PARAMS,
  masses: DEFAULT_MASSES,
  target: FORECAST_TARGET,
};

export function paramsKey(params: ForecastParams): string {
  return `${params.halfLife}/${params.bandwidth}/${params.weekday}`;
}

export function sameParams(a: ForecastParams, b: ForecastParams): boolean {
  return a.halfLife === b.halfLife && a.bandwidth === b.bandwidth && a.weekday === b.weekday;
}

/* ------------------------------- Releases -------------------------------- */

function entryTime(entry: VersionHistoryEntry): number {
  return Date.parse(entry.releaseDate ?? entry.detectedAt);
}

export interface Release {
  time: number;
  version: string | null;
}

/** Recorded releases, oldest first; releases within an hour of each other merge. */
export function releasesOf(entries: readonly VersionHistoryEntry[]): Release[] {
  const sorted = entries
    .map((entry) => ({ time: entryTime(entry), version: entry.version }))
    .filter((release) => !Number.isNaN(release.time))
    .sort((a, b) => a.time - b.time);
  return sorted;
}

/** Release times with near-duplicates merged (the first of each cluster is kept). */
export function distinctTimes(releases: readonly Release[]): number[] {
  const times: number[] = [];
  for (const release of releases) {
    const last = times[times.length - 1];
    if (last === undefined || release.time - last >= SAME_RELEASE_MS) times.push(release.time);
  }
  return times;
}

/** Days between consecutive distinct releases, oldest first. */
export function gapsBetween(times: readonly number[]): number[] {
  return times.slice(1).map((time, i) => (time - times[i]!) / DAY_MS);
}

/* -------------------------------- Shape ---------------------------------- */

/** Recency weights for `n` gaps, oldest first. */
export function recencyWeights(n: number, halfLife: number): number[] {
  return Array.from({ length: n }, (_, i) => 0.5 ** ((n - 1 - i) / halfLife));
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

/** Typical gap and the middle half of recent gaps, in days. */
export function gapShape(
  gaps: readonly number[],
  halfLife: number,
): { typical: number; low: number; high: number } {
  const weights = recencyWeights(gaps.length, halfLife);
  const logs = gaps.map((days) => Math.log(Math.max(days, 1 / 24)));
  return {
    typical: Math.exp(weightedQuantile(logs, weights, 0.5)),
    low: Math.exp(weightedQuantile(logs, weights, 0.25)),
    high: Math.exp(weightedQuantile(logs, weights, 0.75)),
  };
}

/* ----------------------------- Distribution ------------------------------ */

/**
 * Chance of the next release per time slot after the last one. Slot k
 * covers days [k·step, (k+1)·step). `tail` is the chance it comes after the
 * last slot.
 */
export interface Distribution {
  step: number;
  mass: Float64Array;
  tail: number;
}

/** Slot size and count: fine enough for weekdays, long enough for the slowest gaps. */
export function gridFor(gaps: readonly number[]): { step: number; slots: number } {
  const sorted = [...gaps].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const longest = sorted[sorted.length - 1] ?? 1;
  const step = Math.max(1 / 24, Math.min(1, typical / 50));
  const extent = Math.min(1100, Math.max(4 * longest, 3 * typical, 14 * step + 1));
  return { step, slots: Math.ceil(extent / step) };
}

/** The smooth gap distribution alone, before the weekday lean (mass per slot). */
export function kernelMass(
  gaps: readonly number[],
  weights: readonly number[],
  bandwidth: number,
  step: number,
  slots: number,
): Float64Array {
  const out = new Float64Array(slots);
  const centers = gaps.map((days) => Math.log(Math.max(days, 1 / 24)));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const norm = 1 / (bandwidth * Math.sqrt(2 * Math.PI) * weightSum);
  const spread = 1 / (2 * bandwidth * bandwidth);
  for (let k = 0; k < slots; k++) {
    const days = (k + 0.5) * step;
    const at = Math.log(days);
    let sum = 0;
    for (let i = 0; i < centers.length; i++) {
      const d = at - centers[i]!;
      const e = d * d * spread;
      if (e < 18) sum += weights[i]! * Math.exp(-e);
    }
    // Density on the log scale, converted to days.
    out[k] = (sum * norm * step) / days;
  }
  return out;
}

/** How much more (or less) likely each UTC weekday is than average, from recent releases. */
export function weekdayFactors(times: readonly number[], strength: number): number[] {
  const counts = new Array<number>(7).fill(1); // add-one smoothing
  const sample = times.slice(-30);
  for (const time of sample) counts[new Date(time).getUTCDay()]! += 1;
  const total = sample.length + 7;
  const raw = counts.map((count) => ((count / total) * 7) ** strength);
  const mean = raw.reduce((sum, r) => sum + r, 0) / 7;
  return raw.map((r) => r / mean);
}

/** Weekday lean needs a handful of releases to mean anything. */
const MIN_WEEKDAY_RELEASES = 6;

/** Combine the gap distribution with the weekday lean and the allowance for surprises. */
export function finishDistribution(
  kernel: Float64Array,
  step: number,
  lastTime: number,
  factors: readonly number[] | null,
): Distribution {
  const slots = kernel.length;
  const mass = new Float64Array(slots);
  let kernelTotal = 0;
  let leaned = 0;
  for (let k = 0; k < slots; k++) {
    kernelTotal += kernel[k]!;
    const factor = factors
      ? factors[new Date(lastTime + (k + 0.5) * step * DAY_MS).getUTCDay()]!
      : 1;
    mass[k] = kernel[k]! * factor;
    leaned += mass[k]!;
  }
  // The weekday lean moves probability between days; it doesn't add any.
  const scale = leaned > 0 ? Math.min(1, kernelTotal) / leaned : 0;
  let total = 0;
  for (let k = 0; k < slots; k++) {
    const lo = Math.max(k * step, 1 / 24);
    const hi = (k + 1) * step;
    const surprise = hi > lo ? Math.log(hi / lo) / SURPRISE_LOG_RANGE : 0;
    mass[k] = (1 - SURPRISE) * mass[k]! * scale + SURPRISE * surprise;
    total += mass[k]!;
  }
  return { step, mass, tail: Math.max(0, 1 - total) };
}

/**
 * The forecast distribution for the gap after the last of `times`, from the
 * recent `gaps` (oldest first). `times` are all releases so far (for weekdays).
 */
export function gapDistribution(
  gaps: readonly number[],
  times: readonly number[],
  params: ForecastParams,
): Distribution {
  const { step, slots } = gridFor(gaps);
  const kernel = kernelMass(
    gaps,
    recencyWeights(gaps.length, params.halfLife),
    params.bandwidth,
    step,
    slots,
  );
  const factors =
    params.weekday > 0 && times.length >= MIN_WEEKDAY_RELEASES
      ? weekdayFactors(times, params.weekday)
      : null;
  return finishDistribution(kernel, step, times[times.length - 1] ?? 0, factors);
}

/**
 * How surprised the forecast was by a real gap: minus the log of its
 * probability density on a log-day scale. Lower is better; this is what
 * training minimizes.
 */
export function logLoss(dist: Distribution, actualDays: number): number {
  const k = Math.floor(actualDays / dist.step);
  const density =
    k < dist.mass.length ? (dist.mass[k]! / dist.step) * actualDays : SURPRISE / SURPRISE_LOG_RANGE;
  return -Math.log(Math.max(density, 1e-9));
}

export interface ForecastWindow {
  /** Days after the last release. */
  from: number;
  to: number;
  /** Equal chance of the release coming before or after this day. */
  point: number;
  /** Chance a release is still to come after the time already waited. */
  survival: number;
}

/**
 * The shortest window holding `mass` of the chance of the next release,
 * given none has come in the first `elapsed` days.
 */
export function forecastWindow(
  dist: Distribution,
  mass: number,
  elapsed = 0,
): ForecastWindow | null {
  const { step } = dist;
  const slots = dist.mass;
  const start = Math.max(0, Math.floor(elapsed / step));
  if (start >= slots.length) return null;
  let total = 0;
  for (let k = start; k < slots.length; k++) total += slots[k]!;
  if (total <= 0) return null;
  const target = mass * total;
  let bestLo = start;
  let bestHi = slots.length - 1;
  let lo = start;
  let sum = 0;
  for (let hi = start; hi < slots.length; hi++) {
    sum += slots[hi]!;
    while (lo < hi && sum - slots[lo]! >= target) {
      sum -= slots[lo]!;
      lo++;
    }
    if (sum >= target && hi - lo < bestHi - bestLo) {
      bestLo = lo;
      bestHi = hi;
    }
  }
  let seen = 0;
  let point = elapsed;
  for (let k = start; k < slots.length; k++) {
    const next = seen + slots[k]!;
    if (next >= total / 2) {
      const within = slots[k]! > 0 ? (total / 2 - seen) / slots[k]! : 0.5;
      point = (k + within) * step;
      break;
    }
    seen = next;
  }
  return {
    from: Math.max(elapsed, bestLo * step),
    to: Math.max(elapsed, (bestHi + 1) * step),
    point: Math.max(elapsed, point),
    survival: total + dist.tail,
  };
}

/** Which elapsed band a forecast falls in. */
export function elapsedBand(elapsedDays: number, typicalDays: number): number {
  const ratio = typicalDays > 0 ? elapsedDays / typicalDays : 0;
  let band = 0;
  while (band < ELAPSED_BAND_EDGES.length && ratio >= ELAPSED_BAND_EDGES[band]!) band++;
  return band;
}

/** Representative elapsed ratio for each band (used when learning window sizes). */
export const BAND_SAMPLE_RATIOS: readonly number[] = [0, 0.75, 1.25, 2];

/** Relative chance of a release across [fromDays, toDays], in `count` equal steps (for drawing). */
export function densityProfile(
  dist: Distribution,
  fromDays: number,
  toDays: number,
  count: number,
): number[] {
  const out: number[] = [];
  const width = (toDays - fromDays) / count;
  for (let i = 0; i < count; i++) {
    const a = fromDays + i * width;
    const b = a + width;
    let sum = 0;
    const first = Math.max(0, Math.floor(a / dist.step));
    const last = Math.min(dist.mass.length - 1, Math.floor(b / dist.step));
    for (let k = first; k <= last; k++) {
      const lo = Math.max(a, k * dist.step);
      const hi = Math.min(b, (k + 1) * dist.step);
      if (hi > lo) sum += (dist.mass[k]! * (hi - lo)) / dist.step;
    }
    out.push(sum);
  }
  return out;
}

/* -------------------------------- Replays -------------------------------- */

/** One past release to check a forecast against. */
export interface ReplayCase {
  /** Recent gaps known before it (oldest first). */
  gaps: number[];
  /** Release times known before it (oldest first; the last is the release it followed). */
  times: number[];
  /** The real gap, in days. */
  actual: number;
}

/**
 * The listing's past, replayed: for each of its last `max` releases (with at
 * least MIN_GAPS gaps before it), what was known right before it.
 */
export function replayCases(times: readonly number[], max = 20): ReplayCase[] {
  const gaps = gapsBetween(times);
  const cases: ReplayCase[] = [];
  for (let k = Math.max(MIN_GAPS, gaps.length - max); k < gaps.length; k++) {
    cases.push({
      gaps: gaps.slice(Math.max(0, k - RECENT_GAPS), k),
      times: times.slice(0, k + 1),
      actual: gaps[k]!,
    });
  }
  return cases;
}

export interface TrackRecord {
  /** Past releases the forecast was checked against. */
  tests: number;
  /** How many landed inside the expected window. */
  hits: number;
  /** Median distance between the expected day and the real release, in days. */
  medianErrorDays: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)]! + sorted[Math.ceil(mid)]!) / 2;
}

/**
 * How the forecast would have done on this listing's recent releases, each
 * forecast made right after the release before it. Null with too little
 * history.
 */
export function trackRecord(
  times: readonly number[],
  model: ForecastModel = DEFAULT_MODEL,
  max = 20,
): TrackRecord | null {
  const errors: number[] = [];
  let hits = 0;
  for (const replay of replayCases(times, max)) {
    const dist = gapDistribution(replay.gaps, replay.times, model.params);
    const window = forecastWindow(dist, model.masses[0] ?? FORECAST_TARGET, 0);
    if (!window) continue;
    if (replay.actual >= window.from && replay.actual <= window.to) hits += 1;
    errors.push(Math.abs(replay.actual - window.point));
  }
  if (errors.length < 3) return null;
  return { tests: errors.length, hits, medianErrorDays: median(errors) };
}
