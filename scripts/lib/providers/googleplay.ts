/**
 * Google Play provider.
 *
 * Google Play has no public metadata API, so this provider uses the
 * `google-play-scraper` package, which parses the public store pages. That
 * approach is inherently less stable than Apple's lookup API: Google can and
 * does change the page structure. For that reason everything Play-specific is
 * isolated in this module — if scraping breaks, only this file (or the
 * underlying package) needs to change.
 *
 * The scraper is loaded lazily and injected so tests never touch the network.
 */

import { htmlToPlainText } from '../../../src/shared/text.ts';
import { withRetry, withTimeout } from '../net.ts';
import type { TrackTarget } from '../config.ts';
import type { AppSnapshot, ProviderFetch } from './types.ts';
import { asIsoDate, asNonEmptyString, ProviderError } from './types.ts';

/** The subset of google-play-scraper's app() result that AppWatch reads. */
export interface PlayAppDetails {
  title?: unknown;
  developer?: unknown;
  icon?: unknown;
  url?: unknown;
  version?: unknown;
  updated?: unknown;
  recentChanges?: unknown;
  genre?: unknown;
}

export type PlayAppFn = (options: {
  appId: string;
  lang: string;
  country: string;
}) => Promise<PlayAppDetails>;

async function loadScraper(): Promise<PlayAppFn> {
  const gplay = (await import('google-play-scraper')).default;
  return (options) => gplay.app(options);
}

interface GooglePlayProviderOptions {
  /** Injectable scraper loader; tests provide a stub. */
  loadAppFn?: () => Promise<PlayAppFn>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
}

export function createGooglePlayProvider(options: GooglePlayProviderOptions = {}): ProviderFetch {
  const {
    loadAppFn = loadScraper,
    timeoutMs = 20_000,
    retries = 2,
    retryDelayMs = 2000,
    log,
  } = options;
  let appFnPromise: Promise<PlayAppFn> | undefined;

  return async function fetchGooglePlayApp(target: TrackTarget): Promise<AppSnapshot> {
    appFnPromise ??= loadAppFn();
    const appFn = await appFnPromise;
    const details = await withRetry(
      () =>
        withTimeout(
          appFn({ appId: target.storeId, lang: target.language, country: target.country }),
          timeoutMs,
          `google:${target.storeId}`,
        ),
      { retries, baseDelayMs: retryDelayMs, label: `google:${target.storeId}`, log },
    );
    return normalizePlayResult(details, target);
  };
}

/** Maps a raw google-play-scraper result onto the normalized snapshot shape. */
export function normalizePlayResult(details: PlayAppDetails, target: TrackTarget): AppSnapshot {
  if (typeof details !== 'object' || details === null) {
    throw new ProviderError('Unexpected response from Google Play (not an object)');
  }
  const name = asNonEmptyString(details.title);
  if (!name) {
    throw new ProviderError('Google Play result is missing the app title');
  }
  const rawVersion = asNonEmptyString(details.version);
  // Play reports "Varies with device" (or "VARY") when there is no single version.
  const version =
    rawVersion && !/^varies with device$/i.test(rawVersion) && rawVersion !== 'VARY'
      ? rawVersion
      : null;
  const rawNotes = asNonEmptyString(details.recentChanges);
  return {
    platform: 'google',
    storeId: target.storeId,
    name,
    developer: asNonEmptyString(details.developer),
    iconUrl: asNonEmptyString(details.icon),
    storeUrl:
      asNonEmptyString(details.url) ??
      `https://play.google.com/store/apps/details?id=${encodeURIComponent(target.storeId)}`,
    version,
    releaseDate: asIsoDate(details.updated),
    releaseNotes: rawNotes ? htmlToPlainText(rawNotes) : null,
    category: asNonEmptyString(details.genre),
    bundleId: null,
  };
}
