/**
 * Parses apps.config.json — the human-edited list of tracked apps.
 *
 * Accepted entry forms:
 *   - "https://apps.apple.com/us/app/wikipedia/id324715238"   (App Store URL)
 *   - "https://play.google.com/store/apps/details?id=org.wikipedia" (Play URL)
 *   - { "platform": "apple",  "id": "324715238" }             (numeric App Store ID)
 *   - { "platform": "google", "id": "org.wikipedia" }         (package name)
 */

import type { Platform } from '../../src/shared/types.ts';
import { appId } from '../../src/shared/types.ts';

export interface TrackTarget {
  platform: Platform;
  storeId: string;
  /** Two-letter storefront/country code, e.g. "us". */
  country: string;
  /** Language code used for Google Play metadata, e.g. "en". */
  language: string;
}

export interface CheckerConfig {
  targets: TrackTarget[];
}

export class ConfigError extends Error {}

interface Defaults {
  country: string;
  language: string;
}

const APPLE_URL = /^https?:\/\/(?:apps|itunes)\.apple\.com\/(?:([a-z]{2})\/)?.*?id(\d+)/i;
const PLAY_URL = /^https?:\/\/play\.google\.com\/store\/apps\/details/i;
const PLAY_PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const APPLE_ID = /^\d+$/;

function parseUrlEntry(url: string, defaults: Defaults): TrackTarget {
  const apple = APPLE_URL.exec(url);
  if (apple) {
    const [, country, id] = apple;
    if (!id) throw new ConfigError(`Could not find a numeric app ID in App Store URL: ${url}`);
    return {
      platform: 'apple',
      storeId: id,
      country: (country ?? defaults.country).toLowerCase(),
      language: defaults.language,
    };
  }
  if (PLAY_URL.test(url)) {
    let packageName: string | null;
    try {
      packageName = new URL(url).searchParams.get('id');
    } catch {
      packageName = null;
    }
    if (!packageName || !PLAY_PACKAGE.test(packageName)) {
      throw new ConfigError(`Could not find a package name ("?id=...") in Play URL: ${url}`);
    }
    return {
      platform: 'google',
      storeId: packageName,
      country: defaults.country,
      language: defaults.language,
    };
  }
  throw new ConfigError(
    `Unrecognized app URL: ${url}\n` +
      '  Expected an App Store URL (https://apps.apple.com/...) or a ' +
      'Google Play URL (https://play.google.com/store/apps/details?id=...).',
  );
}

function parseObjectEntry(entry: Record<string, unknown>, defaults: Defaults): TrackTarget {
  const platform = entry.platform;
  const id = entry.id;
  if (platform !== 'apple' && platform !== 'google') {
    throw new ConfigError(
      `Entry ${JSON.stringify(entry)}: "platform" must be "apple" or "google".`,
    );
  }
  if (typeof id !== 'string' || id.length === 0) {
    throw new ConfigError(`Entry ${JSON.stringify(entry)}: "id" must be a non-empty string.`);
  }
  if (platform === 'apple' && !APPLE_ID.test(id)) {
    throw new ConfigError(
      `Entry ${JSON.stringify(entry)}: Apple IDs are numeric (e.g. "324715238").`,
    );
  }
  if (platform === 'google' && !PLAY_PACKAGE.test(id)) {
    throw new ConfigError(
      `Entry ${JSON.stringify(entry)}: Google Play IDs are package names (e.g. "org.wikipedia").`,
    );
  }
  const country = typeof entry.country === 'string' ? entry.country : defaults.country;
  const language = typeof entry.language === 'string' ? entry.language : defaults.language;
  return { platform, storeId: id, country: country.toLowerCase(), language };
}

export function parseConfig(raw: unknown): CheckerConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError('apps.config.json must be a JSON object with an "apps" array.');
  }
  const root = raw as Record<string, unknown>;
  const defaults: Defaults = {
    country: typeof root.country === 'string' ? root.country.toLowerCase() : 'us',
    language: typeof root.language === 'string' ? root.language : 'en',
  };
  if (!Array.isArray(root.apps)) {
    throw new ConfigError('apps.config.json must contain an "apps" array.');
  }
  const targets: TrackTarget[] = [];
  const seen = new Set<string>();
  for (const entry of root.apps) {
    let target: TrackTarget;
    if (typeof entry === 'string') {
      target = parseUrlEntry(entry.trim(), defaults);
    } else if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      target = parseObjectEntry(entry as Record<string, unknown>, defaults);
    } else {
      throw new ConfigError(
        `Unsupported entry in "apps": ${JSON.stringify(entry)} (expected a URL string or an object).`,
      );
    }
    const key = appId(target.platform, target.storeId);
    if (!seen.has(key)) {
      seen.add(key);
      targets.push(target);
    }
  }
  return { targets };
}
