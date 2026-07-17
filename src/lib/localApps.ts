/**
 * Browser-local watched apps ("local apps"): listings the visitor discovered
 * through search and chose to keep an eye on. These live only in this
 * browser's localStorage. They are NOT tracked by the repository's scheduled
 * checker, receive no automatic version history, and never sync anywhere —
 * the UI says so explicitly wherever they appear.
 */

import type { Platform } from '../shared/types.ts';
import { appId } from '../shared/types.ts';
import { readJsonPref, writeJsonPref } from './prefs.ts';

export interface LocalApp {
  id: string;
  platform: Platform;
  storeId: string;
  name: string;
  developer: string | null;
  iconUrl: string | null;
  storeUrl: string;
  version: string | null;
  releaseDate: string | null;
  category: string | null;
  price: string | null;
  rating: number | null;
  ratingCount: number | null;
  /** True when metadata came from a live store lookup; false for bare IDs. */
  resolved: boolean;
  /** When this app was added in this browser (ISO 8601). */
  addedAt: string;
  /** When metadata was last refreshed by a lookup (ISO 8601), if ever. */
  refreshedAt: string | null;
}

const STORAGE_KEY = 'appwatch:local-apps:v1';

function isLocalApp(value: unknown): value is LocalApp {
  if (typeof value !== 'object' || value === null) return false;
  const app = value as Record<string, unknown>;
  return (
    (app.platform === 'apple' || app.platform === 'google') &&
    typeof app.storeId === 'string' &&
    app.storeId.length > 0 &&
    typeof app.name === 'string' &&
    typeof app.storeUrl === 'string' &&
    typeof app.addedAt === 'string' &&
    typeof app.id === 'string'
  );
}

export interface LocalAppsStore {
  list(): LocalApp[];
  has(id: string): boolean;
  /** Adds or replaces (same id updates in place). Returns the stored list. */
  save(app: LocalApp): LocalApp[];
  remove(id: string): LocalApp[];
}

export function createLocalAppsStore(): LocalAppsStore {
  let apps: LocalApp[] = [];
  const raw = readJsonPref(STORAGE_KEY);
  if (Array.isArray(raw)) {
    apps = raw.filter(isLocalApp);
  }

  function persist(): void {
    writeJsonPref(STORAGE_KEY, apps);
  }

  return {
    list: () => [...apps],
    has: (id) => apps.some((app) => app.id === id),
    save(app) {
      apps = [...apps.filter((existing) => existing.id !== app.id), app];
      persist();
      return [...apps];
    },
    remove(id) {
      apps = apps.filter((app) => app.id !== id);
      persist();
      return [...apps];
    },
  };
}

export function makeLocalApp(
  input: Omit<LocalApp, 'id' | 'addedAt' | 'refreshedAt'> & { refreshedAt?: string | null },
  now: Date = new Date(),
): LocalApp {
  return {
    ...input,
    id: appId(input.platform, input.storeId),
    addedAt: now.toISOString(),
    refreshedAt: input.refreshedAt ?? (input.resolved ? now.toISOString() : null),
  };
}

/** The apps.config.json line the visitor can copy to request repository tracking. */
export function configSnippetFor(app: Pick<LocalApp, 'storeUrl'>): string {
  return `"${app.storeUrl}"`;
}
