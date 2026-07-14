/**
 * Merges freshly fetched store snapshots with the previously stored records,
 * detecting version changes, preserving history, and deciding whether the run
 * produced anything worth committing.
 */

import type {
  AppRecord,
  AppsFile,
  HistoryFile,
  Platform,
  VersionHistoryEntry,
} from '../../src/shared/types.ts';
import { appId } from '../../src/shared/types.ts';
import { isVersionChange } from '../../src/shared/version.ts';
import type { AppSnapshot } from './providers/types.ts';

export type MergeOutcome = 'new' | 'updated' | 'unchanged' | 'failed';

export interface MergeResult {
  record: AppRecord;
  /** Complete history for this app, newest first. */
  history: VersionHistoryEntry[];
  outcome: MergeOutcome;
}

/** Prepend a history entry unless that version is already recorded. */
export function appendHistory(
  history: VersionHistoryEntry[],
  entry: VersionHistoryEntry,
): VersionHistoryEntry[] {
  if (history.some((existing) => existing.version === entry.version)) {
    return history;
  }
  return [entry, ...history];
}

/** Merge a successful store fetch with the previous record (if any). */
export function mergeSnapshot(
  previous: AppRecord | undefined,
  previousHistory: VersionHistoryEntry[],
  snapshot: AppSnapshot,
  now: string,
): MergeResult {
  const id = appId(snapshot.platform, snapshot.storeId);

  if (!previous) {
    // First successful check: history begins from this snapshot.
    const history: VersionHistoryEntry[] = snapshot.version
      ? [
          {
            version: snapshot.version,
            releaseDate: snapshot.releaseDate,
            releaseNotes: snapshot.releaseNotes,
            detectedAt: now,
          },
        ]
      : [];
    return {
      record: {
        id,
        platform: snapshot.platform,
        storeId: snapshot.storeId,
        name: snapshot.name,
        developer: snapshot.developer,
        iconUrl: snapshot.iconUrl,
        storeUrl: snapshot.storeUrl,
        currentVersion: snapshot.version,
        previousVersion: null,
        releaseDate: snapshot.releaseDate,
        releaseNotes: snapshot.releaseNotes,
        category: snapshot.category,
        bundleId: snapshot.bundleId,
        firstTrackedAt: now,
        lastCheckedAt: now,
        lastUpdatedAt: null,
        checkStatus: 'ok',
        checkError: null,
        updateDetected: false,
      },
      history,
      outcome: 'new',
    };
  }

  const versionChanged = isVersionChange(previous.currentVersion, snapshot.version);
  let history = previousHistory;
  if (snapshot.version) {
    history = appendHistory(previousHistory, {
      version: snapshot.version,
      releaseDate: snapshot.releaseDate,
      releaseNotes: snapshot.releaseNotes,
      detectedAt: now,
    });
  }

  return {
    record: {
      ...previous,
      name: snapshot.name,
      developer: snapshot.developer ?? previous.developer,
      iconUrl: snapshot.iconUrl ?? previous.iconUrl,
      storeUrl: snapshot.storeUrl,
      currentVersion: snapshot.version ?? previous.currentVersion,
      previousVersion: versionChanged ? previous.currentVersion : previous.previousVersion,
      releaseDate: snapshot.releaseDate ?? (versionChanged ? null : previous.releaseDate),
      releaseNotes: snapshot.releaseNotes ?? (versionChanged ? null : previous.releaseNotes),
      category: snapshot.category ?? previous.category,
      bundleId: snapshot.bundleId ?? previous.bundleId,
      lastCheckedAt: now,
      lastUpdatedAt: versionChanged ? now : previous.lastUpdatedAt,
      checkStatus: 'ok',
      checkError: null,
      updateDetected: versionChanged,
    },
    history,
    outcome: versionChanged ? 'updated' : 'unchanged',
  };
}

/** Record a failed check without losing previously stored data. */
export function mergeFailure(
  previous: AppRecord | undefined,
  previousHistory: VersionHistoryEntry[],
  platform: Platform,
  storeId: string,
  storeUrl: string,
  error: string,
  now: string,
): MergeResult {
  const message = error.length > 300 ? `${error.slice(0, 300)}…` : error;
  if (previous) {
    return {
      record: {
        ...previous,
        checkStatus: 'error',
        checkError: message,
        updateDetected: false,
      },
      history: previousHistory,
      outcome: 'failed',
    };
  }
  // Never fetched successfully: create a stub so the failure is visible.
  return {
    record: {
      id: appId(platform, storeId),
      platform,
      storeId,
      name: storeId,
      developer: null,
      iconUrl: null,
      storeUrl,
      currentVersion: null,
      previousVersion: null,
      releaseDate: null,
      releaseNotes: null,
      category: null,
      bundleId: null,
      firstTrackedAt: now,
      lastCheckedAt: null,
      lastUpdatedAt: null,
      checkStatus: 'error',
      checkError: message,
      updateDetected: false,
    },
    history: [],
    outcome: 'failed',
  };
}

/**
 * Decide whether the new data is worth committing. Timestamp-only churn
 * (lastCheckedAt, generatedAt, the updateDetected flag flipping back to false,
 * and status.json counters) is not meaningful on its own.
 */
export function hasMeaningfulChange(
  previousApps: AppsFile | null,
  nextApps: AppsFile,
  previousHistory: HistoryFile | null,
  nextHistory: HistoryFile,
): boolean {
  if (!previousApps || !previousHistory) return true;
  const strip = (file: AppsFile): unknown =>
    file.apps.map(({ lastCheckedAt: _c, updateDetected: _u, ...rest }) => rest);
  return (
    JSON.stringify(strip(previousApps)) !== JSON.stringify(strip(nextApps)) ||
    JSON.stringify(previousHistory.entries) !== JSON.stringify(nextHistory.entries)
  );
}
