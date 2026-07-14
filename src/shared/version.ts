/**
 * Tolerant version comparison. Store version strings are not guaranteed to be
 * semver ("17.5.1", "2024.06.20", "8.4", "1.2.3-beta2" all appear in the wild),
 * so this compares dot/dash-separated segments numerically when both sides are
 * numeric and lexicographically otherwise.
 */

function segments(version: string): string[] {
  return version
    .trim()
    .split(/[.\-_+ ]+/)
    .filter((s) => s.length > 0);
}

/** Returns negative if a < b, positive if a > b, 0 when equivalent. */
export function compareVersions(a: string, b: string): number {
  const sa = segments(a);
  const sb = segments(b);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const x = sa[i];
    const y = sb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : NaN;
    const ny = /^\d+$/.test(y) ? Number(y) : NaN;
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Whether a fetched version should be treated as a change from the stored one.
 * Any difference counts (stores occasionally roll versions back or re-publish),
 * but null/empty values never trigger a change.
 */
export function isVersionChange(previous: string | null, next: string | null): boolean {
  if (!previous || !next) return false;
  return previous.trim() !== next.trim();
}
