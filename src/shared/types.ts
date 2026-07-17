/**
 * Data model shared by the update checker (scripts/) and the frontend (src/).
 *
 * The generated JSON files in public/data/ follow these shapes:
 *   - apps.json    -> AppsFile
 *   - history.json -> HistoryFile
 *   - status.json  -> StatusFile
 */

export type Platform = 'apple' | 'google';

export type CheckStatus = 'ok' | 'error' | 'pending';

/** One recorded release of an app, captured at the moment AppWatch detected it. */
export interface VersionHistoryEntry {
  /** Version string as reported by the store. */
  version: string;
  /** Release date reported by the store at detection time (ISO 8601), if available. */
  releaseDate: string | null;
  /** Release notes available at detection time, plain text. */
  releaseNotes: string | null;
  /** When AppWatch first saw this version (ISO 8601). */
  detectedAt: string;
}

/** A normalized, store-agnostic app record. */
export interface AppRecord {
  /** Stable identifier: `${platform}:${storeId}`. */
  id: string;
  platform: Platform;
  /** Numeric App Store ID (Apple) or package name (Google Play). */
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
