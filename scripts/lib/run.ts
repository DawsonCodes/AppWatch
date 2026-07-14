/**
 * Orchestrates one full checker run: fetch every configured app, merge with
 * stored data, and write the generated files only when something meaningful
 * changed. One app failing never stops the rest of the run.
 */

import { join } from 'node:path';
import type {
  AppRecord,
  AppsFile,
  HistoryFile,
  Platform,
  StatusFile,
  VersionHistoryEntry,
} from '../../src/shared/types.ts';
import { appId, SCHEMA_VERSION } from '../../src/shared/types.ts';
import {
  validateAppsFile,
  validateHistoryFile,
  validateStatusFile,
} from '../../src/shared/validate.ts';
import type { CheckerConfig, TrackTarget } from './config.ts';
import { readJsonFile, writeJsonFile } from './io.ts';
import { hasMeaningfulChange, mergeFailure, mergeSnapshot } from './merge.ts';
import type { MergeOutcome } from './merge.ts';
import { errorMessage, sleep } from './net.ts';
import type { ProviderFetch } from './providers/types.ts';

export interface RunOptions {
  config: CheckerConfig;
  providers: Record<Platform, ProviderFetch>;
  /** Directory holding apps.json / history.json / status.json. */
  dataDir: string;
  /** Politeness delay between store requests, in milliseconds. */
  delayMs?: number;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface AppRunSummary {
  id: string;
  name: string;
  platform: Platform;
  outcome: MergeOutcome;
  version: string | null;
  previousVersion: string | null;
  error: string | null;
}

export interface RunResult {
  /** True when files were (re)written and should be committed. */
  changed: boolean;
  apps: AppsFile;
  history: HistoryFile;
  status: StatusFile;
  summaries: AppRunSummary[];
  okCount: number;
  errorCount: number;
  updatesDetected: number;
}

function fallbackStoreUrl(target: TrackTarget): string {
  return target.platform === 'apple'
    ? `https://apps.apple.com/${target.country}/app/id${target.storeId}`
    : `https://play.google.com/store/apps/details?id=${encodeURIComponent(target.storeId)}`;
}

export async function runCheck(options: RunOptions): Promise<RunResult> {
  const {
    config,
    providers,
    dataDir,
    delayMs = 1500,
    now = () => new Date(),
    log = () => {},
  } = options;
  const nowIso = now().toISOString();

  const appsPath = join(dataDir, 'apps.json');
  const historyPath = join(dataDir, 'history.json');
  const statusPath = join(dataDir, 'status.json');

  const previousAppsRaw = readJsonFile(appsPath);
  const previousHistoryRaw = readJsonFile(historyPath);
  const previousApps =
    previousAppsRaw && validateAppsFile(previousAppsRaw).length === 0
      ? (previousAppsRaw as AppsFile)
      : null;
  const previousHistory =
    previousHistoryRaw && validateHistoryFile(previousHistoryRaw).length === 0
      ? (previousHistoryRaw as HistoryFile)
      : null;
  if (previousAppsRaw && !previousApps) {
    log('warning: existing apps.json failed validation and will be regenerated');
  }

  const previousById = new Map<string, AppRecord>(
    (previousApps?.apps ?? []).map((app) => [app.id, app]),
  );

  const records: AppRecord[] = [];
  const historyEntries: Record<string, VersionHistoryEntry[]> = {};
  const summaries: AppRunSummary[] = [];

  for (const [index, target] of config.targets.entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    const id = appId(target.platform, target.storeId);
    const previous = previousById.get(id);
    const prevHistory = previousHistory?.entries[id] ?? [];
    const provider = providers[target.platform];

    let result;
    try {
      log(`checking ${id} …`);
      const snapshot = await provider(target);
      result = mergeSnapshot(previous, prevHistory, snapshot, nowIso);
    } catch (error) {
      const message = errorMessage(error);
      log(`  ✗ ${id}: ${message}`);
      result = mergeFailure(
        previous,
        prevHistory,
        target.platform,
        target.storeId,
        fallbackStoreUrl(target),
        message,
        nowIso,
      );
    }

    records.push(result.record);
    if (result.history.length > 0) {
      historyEntries[id] = result.history;
    }
    summaries.push({
      id,
      name: result.record.name,
      platform: target.platform,
      outcome: result.outcome,
      version: result.record.currentVersion,
      previousVersion: result.record.previousVersion,
      error: result.record.checkError,
    });
    if (result.outcome !== 'failed') {
      log(
        `  ✓ ${result.record.name} ${result.record.currentVersion ?? '(no version)'} [${result.outcome}]`,
      );
    }
  }

  records.sort((a, b) => a.id.localeCompare(b.id));

  const okCount = summaries.filter((s) => s.outcome !== 'failed').length;
  const errorCount = summaries.length - okCount;
  const updatesDetected = summaries.filter((s) => s.outcome === 'updated').length;

  const apps: AppsFile = { schemaVersion: SCHEMA_VERSION, generatedAt: nowIso, apps: records };
  const history: HistoryFile = { schemaVersion: SCHEMA_VERSION, entries: historyEntries };
  const status: StatusFile = {
    schemaVersion: SCHEMA_VERSION,
    lastRunAt: nowIso,
    lastSuccessAt:
      okCount > 0
        ? nowIso
        : ((readJsonFile(statusPath) as StatusFile | null)?.lastSuccessAt ?? null),
    totalApps: records.length,
    okCount,
    errorCount,
    updatesDetected,
  };

  const changed = hasMeaningfulChange(previousApps, apps, previousHistory, history);

  if (changed) {
    for (const [label, value, validate] of [
      ['apps.json', apps, validateAppsFile],
      ['history.json', history, validateHistoryFile],
      ['status.json', status, validateStatusFile],
    ] as const) {
      const errors = validate(value);
      if (errors.length > 0) {
        throw new Error(`Generated ${label} failed validation:\n  ${errors.join('\n  ')}`);
      }
    }
    writeJsonFile(appsPath, apps);
    writeJsonFile(historyPath, history);
    writeJsonFile(statusPath, status);
    log('data files updated');
  } else {
    log('no meaningful changes — data files left untouched');
  }

  return { changed, apps, history, status, summaries, okCount, errorCount, updatesDetected };
}
