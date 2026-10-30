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
import { appId, historyEntryKey } from '../../src/shared/types.ts';
import { isVersionChange } from '../../src/shared/version.ts';
import type { AppSnapshot, OfficialRelease } from './providers/types.ts';

export type MergeOutcome = 'new' | 'updated' | 'unchanged' | 'failed';

export interface MergeResult {
  record: AppRecord;
  /** Complete history for this app, newest first. */
  history: VersionHistoryEntry[];
  outcome: MergeOutcome;
}

/**
 * Prepend a history entry unless that release is already recorded (matched
 * by version, or by release date for version-less listings). Entries with
 * neither a version nor a release date cannot be identified and are skipped.
 */
export function appendHistory(
  history: VersionHistoryEntry[],
  entry: VersionHistoryEntry,
): VersionHistoryEntry[] {
  const key = historyEntryKey(entry);
  if (key === null || history.some((existing) => historyEntryKey(existing) === key)) {
    return history;
  }
  return [entry, ...history];
}

/** Smaller moves in a record's dates (e.g. time zones, same-day merges) are ignored. */
const RECORD_DATE_TOLERANCE_MS = 36 * 60 * 60 * 1000;

function releaseTime(entry: VersionHistoryEntry): number {
  const time = Date.parse(entry.releaseDate ?? entry.detectedAt);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Fill in releases from the vendor's own release record that history doesn't
 * have yet (release feeds publish every past version with its date, notes
 * and announcement). These are real, published releases — AppWatch just
 * learned about them from the official archive instead of watching them ship.
 *
 * Entries that came from that record follow it if the record is corrected:
 * those with the same announcement link take its date and notes (e.g. a
 * post's real date read from its byline), and those recorded on the
 * listing's first check (`learnedAt`) take its date when it moves by more
 * than a day and a half (e.g. a catalog date-ordering fix). Everything
 * AppWatch observed itself later is never modified.
 */
export function backfillReleases(
  history: VersionHistoryEntry[],
  releases: readonly OfficialRelease[] | undefined,
  now: string,
  learnedAt: string | null = null,
): VersionHistoryEntry[] {
  if (!releases || releases.length === 0) return history;
  const official = new Map<string, OfficialRelease>();
  for (const release of releases) official.set(release.version, release);

  let changed = false;
  let next = history.map((entry) => {
    const release = entry.version ? official.get(entry.version) : undefined;
    if (!release) return entry;
    if (entry.url && entry.url === release.url) {
      if (
        entry.releaseDate === release.releaseDate &&
        entry.releaseNotes === release.releaseNotes
      ) {
        return entry;
      }
      changed = true;
      return { ...entry, releaseDate: release.releaseDate, releaseNotes: release.releaseNotes };
    }
    if (learnedAt !== null && entry.detectedAt === learnedAt && release.releaseDate) {
      const before = entry.releaseDate ? Date.parse(entry.releaseDate) : Number.NaN;
      const after = Date.parse(release.releaseDate);
      if (Number.isNaN(before) || Math.abs(after - before) > RECORD_DATE_TOLERANCE_MS) {
        changed = true;
        return { ...entry, releaseDate: release.releaseDate };
      }
    }
    return entry;
  });
  for (const release of releases) {
    const before = next;
    next = appendHistory(next, {
      version: release.version,
      releaseDate: release.releaseDate,
      releaseNotes: release.releaseNotes,
      detectedAt: now,
      url: release.url,
    });
    if (next !== before) changed = true;
  }
  if (!changed) return history;
  // Stable sort keeps same-day entries in their recorded order.
  return [...next].sort((a, b) => releaseTime(b) - releaseTime(a));
}

/** The history entry for a snapshot's current release. */
function currentEntry(snapshot: AppSnapshot, now: string): VersionHistoryEntry {
  const entry: VersionHistoryEntry = {
    version: snapshot.version,
    releaseDate: snapshot.releaseDate,
    releaseNotes: snapshot.releaseNotes,
    detectedAt: now,
  };
  if (snapshot.releaseUrl !== undefined) entry.url = snapshot.releaseUrl;
  return entry;
}

/** Feed-only fields are added only when the provider supplies them. */
function feedFields(snapshot: AppSnapshot): Pick<AppRecord, 'releaseUrl'> {
  return snapshot.releaseUrl !== undefined ? { releaseUrl: snapshot.releaseUrl } : {};
}

/**
 * Some listings publish no single version (Google Play reports "Varies with
 * device" for many large apps). For those, a newer store release date is the
 * only reliable signal of an update. Only forward moves count, so a store
 * briefly reporting an older date can never fabricate an update.
 */
export function isDateOnlyUpdate(
  previous: Pick<AppRecord, 'currentVersion' | 'releaseDate'>,
  snapshot: Pick<AppSnapshot, 'version' | 'releaseDate'>,
): boolean {
  if (previous.currentVersion || snapshot.version) return false;
  if (!previous.releaseDate || !snapshot.releaseDate) return false;
  const before = Date.parse(previous.releaseDate);
  const after = Date.parse(snapshot.releaseDate);
  return !Number.isNaN(before) && !Number.isNaN(after) && after > before;
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
    // First successful check: history begins from this snapshot (plus the
    // vendor's earlier releases, for release feeds).
    const history = backfillReleases(
      appendHistory([], currentEntry(snapshot, now)),
      snapshot.releases,
      now,
    );
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
        price: snapshot.price,
        contentRating: snapshot.contentRating,
        requiresOs: snapshot.requiresOs,
        sizeBytes: snapshot.sizeBytes,
        rating: snapshot.rating,
        ratingCount: snapshot.ratingCount,
        developerWebsite: snapshot.developerWebsite,
        ...feedFields(snapshot),
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
  const updated = versionChanged || isDateOnlyUpdate(previous, snapshot);
  const history = backfillReleases(
    appendHistory(previousHistory, currentEntry(snapshot, now)),
    snapshot.releases,
    now,
    previous.firstTrackedAt,
  );

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
      releaseNotes: snapshot.releaseNotes ?? (updated ? null : previous.releaseNotes),
      category: snapshot.category ?? previous.category,
      bundleId: snapshot.bundleId ?? previous.bundleId,
      price: snapshot.price ?? previous.price ?? null,
      contentRating: snapshot.contentRating ?? previous.contentRating ?? null,
      requiresOs: snapshot.requiresOs ?? previous.requiresOs ?? null,
      sizeBytes: snapshot.sizeBytes ?? previous.sizeBytes ?? null,
      rating: snapshot.rating ?? previous.rating ?? null,
      ratingCount: snapshot.ratingCount ?? previous.ratingCount ?? null,
      developerWebsite: snapshot.developerWebsite ?? previous.developerWebsite ?? null,
      ...feedFields(snapshot),
      lastCheckedAt: now,
      lastUpdatedAt: updated ? now : previous.lastUpdatedAt,
      checkStatus: 'ok',
      checkError: null,
      updateDetected: updated,
    },
    history,
    outcome: updated ? 'updated' : 'unchanged',
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
 * and status.json counters) is not meaningful on its own. Live rating
 * aggregates drift on almost every run, so they are also treated as volatile —
 * stored values refresh whenever something else meaningful changes.
 */
export function hasMeaningfulChange(
  previousApps: AppsFile | null,
  nextApps: AppsFile,
  previousHistory: HistoryFile | null,
  nextHistory: HistoryFile,
): boolean {
  if (!previousApps || !previousHistory) return true;
  const strip = (file: AppsFile): unknown =>
    file.apps.map(
      ({ lastCheckedAt: _c, updateDetected: _u, rating: _r, ratingCount: _n, ...rest }) => rest,
    );
  return (
    JSON.stringify(strip(previousApps)) !== JSON.stringify(strip(nextApps)) ||
    JSON.stringify(previousHistory.entries) !== JSON.stringify(nextHistory.entries)
  );
}
