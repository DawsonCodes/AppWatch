/**
 * Deploy freshness. The stores do not push events to AppWatch and the site
 * has no server, so "real time" is not honestly possible — what IS possible
 * is noticing quickly when the scheduled checker has deployed newer data.
 * While the page is open and visible, status.json (a few hundred bytes) is
 * revalidated on a restrained interval; when a newer run appears, the UI
 * offers a non-disruptive refresh. The visitor's browser never queries the
 * App Store or Google Play for tracked data.
 */

import type { StatusFile } from '../shared/types.ts';
import { validateStatusFile } from '../shared/validate.ts';
import { dataUrl } from './urls.ts';

export const FRESHNESS_POLL_MS = 5 * 60 * 1000;

/** True when the polled status describes a newer checker run than we loaded. */
export function hasNewerRun(
  loadedLastRunAt: string | null,
  polledLastRunAt: string | null,
): boolean {
  if (!polledLastRunAt) return false;
  const polled = Date.parse(polledLastRunAt);
  if (Number.isNaN(polled)) return false;
  if (!loadedLastRunAt) return true;
  const loaded = Date.parse(loadedLastRunAt);
  if (Number.isNaN(loaded)) return true;
  return polled > loaded;
}

/** Fetch the live status.json, bypassing HTTP caches. Null on any failure. */
export async function pollStatus(fetchFn: typeof fetch = fetch): Promise<StatusFile | null> {
  try {
    const response = await fetchFn(dataUrl('status.json'), {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const raw = (await response.json()) as unknown;
    return validateStatusFile(raw).length === 0 ? (raw as StatusFile) : null;
  } catch {
    return null;
  }
}
