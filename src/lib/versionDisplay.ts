/**
 * Short version numbers: an optional, easier-to-read form of a version for
 * lists ("26.19" instead of "26.19.0+rc3-2026.10.28"). It only trims what is
 * already there (build numbers, tags and trailing zeros), never invents a
 * number, and the full version is always one hover or click away.
 */

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export const SHORT_VERSIONS_PREF_KEY = 'appwatch:short-versions:v1';

/**
 *   26.19.0+rc3-2026…   → 26.19      (tags and trailing zeros dropped)
 *   156.0.8078.74       → 156        (browser-style "156.0.x" is just 156)
 *   0.745.0.7451137     → 0.745      (long build numbers dropped)
 *   1.3.6.1921.g70867c… → 1.3.6      (at most three parts)
 *   1.2026.293          → 1.2026.293 (nothing to trim)
 */
export function shortVersion(raw: string): string {
  const match = /^v?(\d+(?:\.\d+)*)/i.exec(raw.trim());
  if (!match) return raw;
  let parts = match[1]!.split('.');
  // Build numbers (five or more digits) after the minor version.
  const build = parts.findIndex((part, i) => i >= 2 && part.length >= 5);
  if (build !== -1) parts = parts.slice(0, build);
  parts = parts.slice(0, 3);
  while (parts.length > 2 && /^0+$/.test(parts[parts.length - 1]!)) parts.pop();
  // Browser-style numbering: the big first number is the version people know.
  if (parts.length >= 2 && Number(parts[0]) >= 30 && /^0+$/.test(parts[1]!)) parts = [parts[0]!];
  return parts.join('.');
}

/** Whether lists show short version numbers (a display preference). */
export const ShortVersionsContext = createContext(true);

/** The version to show in lists, honoring the preference. */
export function useDisplayVersion(): (raw: string) => string {
  const short = useContext(ShortVersionsContext);
  return short ? shortVersion : (raw) => raw;
}

/**
 * A "from → to" pair for the updates timeline. Short forms are used only
 * when they still differ, so an update never reads "156 → 156".
 */
export function displayPair(
  from: string,
  to: string,
  short: boolean,
): { from: string; to: string } {
  if (!short) return { from, to };
  const a = shortVersion(from);
  const b = shortVersion(to);
  return a === b ? { from, to } : { from: a, to: b };
}
