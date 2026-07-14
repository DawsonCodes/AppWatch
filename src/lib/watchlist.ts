/**
 * Personal watchlist, persisted in localStorage only. Nothing is synced or
 * sent anywhere — the list lives entirely in the visitor's browser. Falls back
 * to in-memory state when storage is unavailable (private browsing, disabled
 * cookies/storage, embedded webviews).
 */

const STORAGE_KEY = 'appwatch:watchlist:v1';

export interface Watchlist {
  /** False when localStorage is unavailable and the list won't survive a reload. */
  readonly persistent: boolean;
  has(id: string): boolean;
  toggle(id: string): boolean;
  ids(): ReadonlySet<string>;
}

function detectStorage(candidate: Storage | null): Storage | null {
  if (!candidate) return null;
  try {
    const probe = 'appwatch:probe';
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return null;
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createWatchlist(storageCandidate: Storage | null = defaultStorage()): Watchlist {
  const storage = detectStorage(storageCandidate);
  let ids = new Set<string>();

  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          ids = new Set(parsed.filter((v): v is string => typeof v === 'string'));
        }
      }
    } catch {
      ids = new Set();
    }
  }

  function persist(): void {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
      // Quota exceeded or storage revoked mid-session: keep the in-memory list.
    }
  }

  return {
    persistent: storage !== null,
    has: (id) => ids.has(id),
    toggle(id) {
      if (ids.has(id)) {
        ids.delete(id);
      } else {
        ids.add(id);
      }
      persist();
      return ids.has(id);
    },
    ids: () => new Set(ids),
  };
}
