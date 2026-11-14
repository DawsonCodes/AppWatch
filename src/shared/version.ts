/**
 * Tolerant version comparison. Store version strings are not guaranteed to be
 * semver ("17.5.1", "2024.06.20", "8.4", "1.2.3-beta2", "1.24b", "6000.6.7f1"
 * all appear in the wild), so this compares dot/dash-separated segments in
 * natural order: runs of digits numerically, everything else as text. That
 * way "1.24b" is newer than "1.9b" and "7f10" is newer than "7f2".
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
  // A letter suffix on a number ("9b", "7f1") only breaks ties: "1.9.1b" is
  // newer than "1.9b" because 1.9.1 is newer than 1.9, whatever the letters.
  let suffixOrder = 0;
  for (let i = 0; i < len; i++) {
    const x = sa[i];
    const y = sb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const mx = /^(\d+)(.*)$/.exec(x);
    const my = /^(\d+)(.*)$/.exec(y);
    if (mx && my) {
      const diff = Number(mx[1]) - Number(my[1]);
      if (diff !== 0) return diff;
      if (suffixOrder === 0) suffixOrder = naturalOrder(mx[2]!, my[2]!);
    } else {
      const order = naturalOrder(x, y);
      if (order !== 0) return order;
    }
  }
  return suffixOrder;
}

/** Text in natural order: digit runs as numbers, the rest by letter; shorter first. */
function naturalOrder(x: string, y: string): number {
  if (x === y) return 0;
  const cx = x.match(/\d+|\D+/g) ?? [];
  const cy = y.match(/\d+|\D+/g) ?? [];
  const len = Math.max(cx.length, cy.length);
  for (let i = 0; i < len; i++) {
    const a = cx[i];
    const b = cy[i];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const na = /^\d/.test(a);
    const nb = /^\d/.test(b);
    if (na && nb) {
      const diff = Number(a) - Number(b);
      if (diff !== 0) return diff;
    } else {
      if (na !== nb) return na ? -1 : 1;
      return a < b ? -1 : 1;
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
