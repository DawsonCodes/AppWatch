/**
 * Teaches the release forecast (src/shared/forecast.ts) from AppWatch's own
 * records, on every checker run that records something new:
 *
 *  1. Replay: for each listing's recent releases, build the forecast that
 *     would have been made right after the release before it, under every
 *     candidate setting, and measure how surprised it was by the real date.
 *  2. Settings: the setting that forecast best across all listings becomes
 *     the shared one; a listing with enough history of its own gets its own
 *     setting when it clearly suits it better (a strong pull toward the
 *     shared one keeps a few lucky guesses from counting).
 *  3. Window sizes: for each "time already waited" band, the window size is
 *     set so the stated chance (2 in 3) really holds when replayed, using
 *     only settings chosen from releases before each one (no hindsight).
 *  4. Live check: real forecasts are logged before the release they predict
 *     and scored when it lands (forecast log). If real results drift from the
 *     stated chance, window sizes are nudged toward it.
 *
 * More recorded releases mean better-chosen settings and better-sized
 * windows, so the forecasts sharpen over time without anyone tuning them.
 */

import type {
  ForecastLogFile,
  ForecastModelFile,
  LiveRecord,
  ScoredForecast,
  VersionHistoryEntry,
} from '../../src/shared/types.ts';
import type {
  Distribution,
  ForecastModel,
  ForecastParams,
  ReplayCase,
} from '../../src/shared/forecast.ts';
import {
  BAND_SAMPLE_RATIOS,
  DAY_MS,
  DEFAULT_MASSES,
  DEFAULT_PARAMS,
  distinctTimes,
  elapsedBand,
  finishDistribution,
  FORECAST_TARGET,
  forecastWindow,
  gapDistribution,
  gapShape,
  gapsBetween,
  gridFor,
  kernelMass,
  logLoss,
  median,
  MIN_GAPS,
  OVERDUE_SURVIVAL,
  PARAM_GRID,
  RECENT_GAPS,
  recencyWeights,
  releasesOf,
  replayCases,
  sameParams,
  weekdayFactors,
} from '../../src/shared/forecast.ts';

/** Replayed releases per listing. */
const REPLAYS_PER_LISTING = 30;
/** How many replayed releases the shared setting counts as, against a listing's own. */
const SHARED_PULL = 30;
/** Bands need this many replayed forecasts before their window size is learned. */
const MIN_BAND_CASES = 30;
/** Real forecasts needed before they adjust window sizes. */
const MIN_LIVE_FORECASTS = 40;
/** Scored forecasts kept per listing. */
const SCORED_KEPT = 20;
const MASS_RANGE = [0.3, 0.95] as const;

interface Replay extends ReplayCase {
  listing: string;
  typical: number;
  /** Loss per PARAM_GRID entry. */
  losses: number[];
}

function round(value: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function timesOf(entries: readonly VersionHistoryEntry[]): number[] {
  return distinctTimes(releasesOf(entries));
}

/** Loss of every candidate setting on one replayed release. */
function replayLosses(replay: ReplayCase): number[] {
  const { step, slots } = gridFor(replay.gaps);
  const last = replay.times[replay.times.length - 1]!;
  const kernels = new Map<string, Float64Array>();
  const factors = new Map<number, number[] | null>();
  return PARAM_GRID.map((params) => {
    const key = `${params.halfLife}/${params.bandwidth}`;
    let kernel = kernels.get(key);
    if (!kernel) {
      kernel = kernelMass(
        replay.gaps,
        recencyWeights(replay.gaps.length, params.halfLife),
        params.bandwidth,
        step,
        slots,
      );
      kernels.set(key, kernel);
    }
    let factor = factors.get(params.weekday);
    if (factor === undefined) {
      factor =
        params.weekday > 0 && replay.times.length >= 6
          ? weekdayFactors(replay.times, params.weekday)
          : null;
      factors.set(params.weekday, factor);
    }
    return logLoss(finishDistribution(kernel, step, last, factor), replay.actual);
  });
}

function argmin(values: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! < values[best]!) best = i;
  return best;
}

/** Hit rate of windows holding `mass`, viewed `ratio` typical gaps after each release. */
function hitRate(
  cases: readonly { replay: Replay; dist: Distribution }[],
  mass: number,
  ratio: number,
): { rate: number; count: number } {
  let hits = 0;
  let count = 0;
  for (const { replay, dist } of cases) {
    const elapsed = ratio * replay.typical;
    if (replay.actual <= elapsed) continue;
    const window = forecastWindow(dist, mass, elapsed);
    if (!window) continue;
    count += 1;
    if (replay.actual >= window.from && replay.actual <= window.to) hits += 1;
  }
  return { rate: count > 0 ? hits / count : 0, count };
}

/** The smallest window size whose replayed hit rate reaches the target. */
function calibrate(
  cases: readonly { replay: Replay; dist: Distribution }[],
  ratio: number,
  target: number,
  fallback: number,
): number {
  if (hitRate(cases, MASS_RANGE[1], ratio).count < MIN_BAND_CASES) return fallback;
  let lo: number = MASS_RANGE[0];
  let hi: number = MASS_RANGE[1];
  if (hitRate(cases, lo, ratio).rate >= target) return lo;
  if (hitRate(cases, hi, ratio).rate < target) return hi;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (hitRate(cases, mid, ratio).rate >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

function liveRecordOf(scored: readonly ScoredForecast[]): LiveRecord | null {
  if (scored.length === 0) return null;
  return {
    forecasts: scored.length,
    hits: scored.filter((s) => s.hit).length,
    medianErrorDays: round(median(scored.map((s) => s.errorDays)), 2),
  };
}

export interface TrainingOptions {
  target?: number;
  trainedAt: string;
}

/** Learn forecast settings and window sizes from the recorded history and forecast log. */
export function trainForecastModel(
  entries: Readonly<Record<string, readonly VersionHistoryEntry[]>>,
  log: ForecastLogFile | null,
  options: TrainingOptions,
): ForecastModelFile {
  const target = options.target ?? FORECAST_TARGET;

  // 1. Replay every listing's recent releases under every setting.
  const replays: Replay[] = [];
  const byListing = new Map<string, Replay[]>();
  for (const [id, list] of Object.entries(entries)) {
    const own: Replay[] = [];
    for (const replay of replayCases(timesOf(list), REPLAYS_PER_LISTING)) {
      const item: Replay = {
        ...replay,
        listing: id,
        typical: gapShape(replay.gaps, DEFAULT_PARAMS.halfLife).typical,
        losses: replayLosses(replay),
      };
      own.push(item);
      replays.push(item);
    }
    if (own.length > 0) byListing.set(id, own);
  }

  // 2. Shared setting, then per-listing settings pulled toward it.
  const meanLoss = PARAM_GRID.map(
    (_, c) => replays.reduce((sum, r) => sum + r.losses[c]!, 0) / Math.max(1, replays.length),
  );
  const shared = replays.length > 0 ? PARAM_GRID[argmin(meanLoss)]! : DEFAULT_PARAMS;
  const listingParams = new Map<string, ForecastParams>();
  // Settings chosen from earlier releases only, for honest window sizing.
  const walkForward: { replay: Replay; params: ForecastParams }[] = [];
  for (const [id, own] of byListing) {
    const running = PARAM_GRID.map(() => 0);
    for (const replay of own) {
      const pick = argmin(running.map((sum, c) => sum + SHARED_PULL * meanLoss[c]!));
      walkForward.push({ replay, params: PARAM_GRID[pick]! });
      replay.losses.forEach((loss, c) => (running[c]! += loss));
    }
    const best = PARAM_GRID[argmin(running.map((sum, c) => sum + SHARED_PULL * meanLoss[c]!))]!;
    if (!sameParams(best, shared)) listingParams.set(id, best);
  }

  // 3. Window sizes per band, so the stated chance holds without hindsight.
  const cases = walkForward.map(({ replay, params }) => ({
    replay,
    dist: gapDistribution(replay.gaps, replay.times, params),
  }));
  let masses = BAND_SAMPLE_RATIOS.map((ratio, band) =>
    round(calibrate(cases, ratio, target, DEFAULT_MASSES[band] ?? target)),
  );

  // 4. Real forecasts: nudge window sizes if real results drift from the target.
  const allScored = Object.values(log?.listings ?? {}).flatMap((l) => l.scored);
  const live = liveRecordOf(allScored);
  if (live && live.forecasts >= MIN_LIVE_FORECASTS) {
    const drift = Math.max(-0.1, Math.min(0.1, 0.5 * (target - live.hits / live.forecasts)));
    masses = masses.map((m) => round(Math.max(MASS_RANGE[0], Math.min(MASS_RANGE[1], m + drift))));
  }

  // Replay summary at release time, with the learned window size.
  let hits = 0;
  const errors: number[] = [];
  for (const { replay, dist } of cases) {
    const window = forecastWindow(dist, masses[0]!, 0);
    if (!window) continue;
    if (replay.actual >= window.from && replay.actual <= window.to) hits += 1;
    errors.push(Math.abs(replay.actual - window.point));
  }

  const listings: ForecastModelFile['listings'] = {};
  for (const id of Object.keys(entries).sort()) {
    const params = listingParams.get(id);
    const liveRecord = liveRecordOf(log?.listings[id]?.scored ?? []);
    if (!params && !liveRecord) continue;
    listings[id] = {
      ...(params ? { params: { ...params } } : {}),
      ...(liveRecord ? { live: liveRecord } : {}),
    };
  }

  return {
    schemaVersion: 1,
    trainedAt: options.trainedAt,
    target: round(target, 4),
    params: { ...shared },
    masses,
    listings,
    replay: {
      tests: errors.length,
      hits,
      medianErrorDays: errors.length > 0 ? round(median(errors), 2) : 0,
    },
    live,
  };
}

/** The model the site uses for one listing. */
export function modelFor(file: ForecastModelFile, id: string): ForecastModel {
  return {
    params: file.listings[id]?.params ?? file.params,
    masses: file.masses,
    target: file.target,
  };
}

/* ------------------------------ Forecast log ------------------------------ */

const iso = (time: number) => new Date(time).toISOString();

/**
 * Score open forecasts whose release has landed. Listings no longer tracked
 * are dropped; a forecast whose starting release disappeared from the
 * history (a corrected date) is discarded.
 */
export function scoreForecasts(
  previous: ForecastLogFile | null,
  entries: Readonly<Record<string, readonly VersionHistoryEntry[]>>,
): ForecastLogFile {
  const listings: ForecastLogFile['listings'] = {};
  for (const id of Object.keys(entries).sort()) {
    const before = previous?.listings[id];
    if (!before) continue;
    const times = timesOf(entries[id]!);
    const scored = [...before.scored];
    let open = before.open;
    if (open) {
      const after = Date.parse(open.after);
      const next = times.find((t) => t - after >= 3_600_000);
      const known = times.some((t) => Math.abs(t - after) < 3_600_000);
      if (next !== undefined && known) {
        scored.push({
          ...open,
          actual: iso(next),
          hit: next >= Date.parse(open.from) && next <= Date.parse(open.to),
          errorDays: round(Math.abs(next - Date.parse(open.point)) / DAY_MS, 2),
        });
        open = null;
      } else if (!known) {
        open = null;
      }
    }
    if (open || scored.length > 0) listings[id] = { open, scored: scored.slice(-SCORED_KEPT) };
  }
  return { schemaVersion: 1, listings };
}

/**
 * Record a forecast, made now, for every listing without an open one: when
 * its next release should land, counting from its latest release. It is
 * scored by `scoreForecasts` once that release is recorded.
 */
export function recordForecasts(
  log: ForecastLogFile,
  entries: Readonly<Record<string, readonly VersionHistoryEntry[]>>,
  model: ForecastModelFile,
  now: Date,
): ForecastLogFile {
  const nowMs = now.getTime();
  const listings: ForecastLogFile['listings'] = { ...log.listings };
  for (const id of Object.keys(entries).sort()) {
    if (listings[id]?.open) continue;
    const times = timesOf(entries[id]!);
    const last = times[times.length - 1];
    if (last === undefined || last > nowMs) continue;
    const gaps = gapsBetween(times).slice(-RECENT_GAPS);
    if (gaps.length < MIN_GAPS) continue;
    const { params, masses } = modelFor(model, id);
    const elapsed = (nowMs - last) / DAY_MS;
    const dist = gapDistribution(gaps, times, params);
    const band = elapsedBand(elapsed, gapShape(gaps, params.halfLife).typical);
    const window = forecastWindow(dist, masses[band] ?? FORECAST_TARGET, elapsed);
    if (!window || window.survival < OVERDUE_SURVIVAL) continue;
    listings[id] = {
      open: {
        madeAt: iso(nowMs),
        after: iso(last),
        from: iso(last + window.from * DAY_MS),
        to: iso(last + window.to * DAY_MS),
        point: iso(last + window.point * DAY_MS),
      },
      scored: listings[id]?.scored ?? [],
    };
  }
  const sorted: ForecastLogFile['listings'] = {};
  for (const id of Object.keys(listings).sort()) sorted[id] = listings[id]!;
  return { schemaVersion: 1, listings: sorted };
}
