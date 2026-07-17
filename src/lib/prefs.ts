/**
 * Tiny guarded localStorage helpers. Every browser-local preference in
 * AppWatch goes through these so storage being unavailable (private windows,
 * blocked storage, embedded webviews) can never throw into UI code.
 */

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the preference simply won't persist.
  }
}

export function removePref(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function readJsonPref(key: string): unknown {
  const raw = readPref(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeJsonPref(key: string, value: unknown): void {
  try {
    writePref(key, JSON.stringify(value));
  } catch {
    // Ignore serialization failures.
  }
}
