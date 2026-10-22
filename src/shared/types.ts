/**
 * Data model shared by the update checker (scripts/) and the frontend (src/).
 *
 * The generated JSON files in public/data/ follow these shapes:
 *   - apps.json    -> AppsFile
 *   - history.json -> HistoryFile
 *   - status.json  -> StatusFile
 */

/**
 * Where a listing lives. `apple` and `google` are the app stores; `windows`
 * and `mac` are desktop versions read from winget, Homebrew or a vendor's
 * official release feed (see src/shared/desktop.ts).
 */
export type Platform = 'apple' | 'google' | 'windows' | 'mac';

/** The two app stores (discovery and browser-local watches only cover these). */
export type StorePlatform = 'apple' | 'google';

/** Display and sort order for platforms. */
export const PLATFORMS: readonly Platform[] = ['apple', 'google', 'windows', 'mac'];

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

export function isDesktopPlatform(platform: Platform): platform is 'windows' | 'mac' {
  return platform === 'windows' || platform === 'mac';
}

export type CheckStatus = 'ok' | 'error' | 'pending';

/** One recorded release of an app, captured at the moment AppWatch detected it. */
export interface VersionHistoryEntry {
  /**
   * Version string as reported by the store, or null for listings that
   * publish no single version (Google Play's "Varies with device"). Such
   * releases are identified by their release date instead.
   */
  version: string | null;
  /** Release date reported by the store at detection time (ISO 8601), if available. */
  releaseDate: string | null;
  /** Release notes available at detection time, plain text. */
  releaseNotes: string | null;
  /** When AppWatch first saw this release (ISO 8601). */
  detectedAt: string;
  /** The vendor's official announcement for this release, when there is one. */
  url?: string | null;
}

/**
 * Identity of a history entry: its version, or for version-less listings its
 * release date. Null when neither is known (such a release cannot be told
 * apart from others and is never recorded).
 */
export function historyEntryKey(
  entry: Pick<VersionHistoryEntry, 'version' | 'releaseDate'>,
): string | null {
  if (entry.version) return entry.version;
  return entry.releaseDate ? `released:${entry.releaseDate}` : null;
}

/** A normalized, store-agnostic app record. */
export interface AppRecord {
  /** Stable identifier: `${platform}:${storeId}`. */
  id: string;
  platform: Platform;
  /**
   * Numeric App Store ID (Apple), package name (Google Play), or for desktop
   * listings "winget:<PackageIdentifier>", "homebrew:<cask>" or a release
   * feed id (e.g. "respondus-lockdown-browser").
   */
  storeId: string;
  name: string;
  developer: string | null;
  iconUrl: string | null;
  storeUrl: string;
  currentVersion: string | null;
  previousVersion: string | null;
  /** Release date of the current version (ISO 8601), if the store provides one. */
  releaseDate: string | null;
  /** Plain-text release notes for the current version. */
  releaseNotes: string | null;
  category: string | null;
  /** Apple bundle identifier when available; null for Google Play. */
  bundleId: string | null;
  /**
   * Extended metadata, collected when the store exposes it reliably.
   * All of these are optional so data generated before they existed stays
   * valid, and null whenever the store does not provide a usable value.
   */
  /** Formatted price label, e.g. "Free" or "$4.99". */
  price?: string | null;
  /** Store content/age rating label, e.g. "4+" or "Everyone". */
  contentRating?: string | null;
  /** Minimum OS requirement as human-readable text, e.g. "iOS 15.0 or later". */
  requiresOs?: string | null;
  /** Download size in bytes (Apple only; Google Play no longer exposes size). */
  sizeBytes?: number | null;
  /** Average user rating on a 0–5 scale, rounded to two decimals. */
  rating?: number | null;
  /** Number of user ratings behind the average. */
  ratingCount?: number | null;
  /** Developer/publisher website URL when the store lists one. */
  developerWebsite?: string | null;
  /** Official release notes page or announcement for the current version (desktop listings). */
  releaseUrl?: string | null;
  /** When AppWatch first tracked this app (ISO 8601). */
  firstTrackedAt: string;
  /** Last time the store was successfully queried for this app (ISO 8601). */
  lastCheckedAt: string | null;
  /** Last time a version change was detected (ISO 8601). */
  lastUpdatedAt: string | null;
  checkStatus: CheckStatus;
  /** Human-readable error from the most recent failed check, if any. */
  checkError: string | null;
  /** True when the most recent committed check detected a version change. */
  updateDetected: boolean;
}

export interface AppsFile {
  schemaVersion: 1;
  /** When this file was generated (ISO 8601); null before the first check. */
  generatedAt: string | null;
  apps: AppRecord[];
}

export interface HistoryFile {
  schemaVersion: 1;
  /** Version history per app, keyed by AppRecord.id, newest entry first. */
  entries: Record<string, VersionHistoryEntry[]>;
}

export interface StatusFile {
  schemaVersion: 1;
  /** When the last committed checker run started; null before the first check. */
  lastRunAt: string | null;
  /** When the last checker run with at least one successful fetch started. */
  lastSuccessAt: string | null;
  totalApps: number;
  okCount: number;
  errorCount: number;
  /** Number of version changes detected in the last committed run. */
  updatesDetected: number;
}

export const SCHEMA_VERSION = 1 as const;

export function appId(platform: Platform, storeId: string): string {
  return `${platform}:${storeId}`;
}
