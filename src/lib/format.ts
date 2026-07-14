/** Date and text formatting helpers (locale-aware via Intl). */

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return dateFormat.format(time);
}

export function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return dateTimeFormat.format(time);
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 days ago", "last month", "just now" — for release dates and check times. */
export function relativeTime(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const deltaSeconds = Math.round((time - now.getTime()) / 1000);
  const magnitude = Math.abs(deltaSeconds);
  if (magnitude < 60) return 'just now';
  for (const [unit, seconds] of UNITS) {
    if (magnitude >= seconds) {
      return relativeFormat.format(Math.trunc(deltaSeconds / seconds), unit);
    }
  }
  return 'just now';
}
