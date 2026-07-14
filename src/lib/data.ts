/** Loads and validates the generated JSON data for the dashboard. */

import type { AppsFile, HistoryFile, StatusFile } from '../shared/types.ts';
import { validateAppsFile, validateHistoryFile, validateStatusFile } from '../shared/validate.ts';
import { dataUrl } from './urls.ts';

export class DataLoadError extends Error {}

async function fetchJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { headers: { accept: 'application/json' } });
  } catch {
    throw new DataLoadError('Network request failed. Check your connection and try again.');
  }
  if (!response.ok) {
    throw new DataLoadError(`The server responded with HTTP ${response.status}.`);
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new DataLoadError('Received malformed JSON data.');
  }
}

export interface DashboardData {
  apps: AppsFile;
  /** Null when status.json failed to load or validate; the dashboard degrades gracefully. */
  status: StatusFile | null;
}

export async function loadDashboardData(fetchFn: typeof fetch = fetch): Promise<DashboardData> {
  const [appsResult, statusResult] = await Promise.allSettled([
    fetchJson(dataUrl('apps.json'), fetchFn),
    fetchJson(dataUrl('status.json'), fetchFn),
  ]);

  if (appsResult.status === 'rejected') {
    throw appsResult.reason instanceof DataLoadError
      ? appsResult.reason
      : new DataLoadError('Could not load app data.');
  }
  const appErrors = validateAppsFile(appsResult.value);
  if (appErrors.length > 0) {
    throw new DataLoadError('App data failed validation and cannot be displayed safely.');
  }

  let status: StatusFile | null = null;
  if (statusResult.status === 'fulfilled' && validateStatusFile(statusResult.value).length === 0) {
    status = statusResult.value as StatusFile;
  }

  return { apps: appsResult.value as AppsFile, status };
}

/** History is only needed for the detail view, so it loads lazily. */
export async function loadHistory(fetchFn: typeof fetch = fetch): Promise<HistoryFile> {
  const raw = await fetchJson(dataUrl('history.json'), fetchFn);
  if (validateHistoryFile(raw).length > 0) {
    throw new DataLoadError('Version history data failed validation.');
  }
  return raw as HistoryFile;
}

/** Hours after which the dashboard flags the data as possibly stale. */
export const STALE_AFTER_HOURS = 26;

export function isDataStale(status: StatusFile | null, now: Date = new Date()): boolean {
  if (!status?.lastRunAt) return false;
  const last = Date.parse(status.lastRunAt);
  if (Number.isNaN(last)) return false;
  return now.getTime() - last > STALE_AFTER_HOURS * 3600 * 1000;
}
