/**
 * The Updates timeline: every release AppWatch has recorded, across all
 * visible apps, newest first and grouped by day. Built only from stored
 * history — nothing is inferred or invented.
 */

import type { HistoryFile } from '../shared/types.ts';
import { historyEntryKey } from '../shared/types.ts';
import type { AppGroup, Listing } from './groups.ts';

export interface TimelineEvent {
  id: string;
  group: AppGroup;
  listing: Listing;
  /** Null for listings that publish no version number. */
  version: string | null;
  /** The previously recorded version of the same listing, when known. */
  previousVersion: string | null;
  releaseDate: string | null;
  detectedAt: string;
  releaseNotes: string | null;
  /** Sort time: the store release date, falling back to detection time. */
  time: number;
  /** The oldest recorded entry — the release that was current when tracking began. */
  firstRecorded: boolean;
}

export interface TimelineDay {
  key: string;
  label: string;
  events: TimelineEvent[];
}

function parse(iso: string | null): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

export function buildTimeline(groups: readonly AppGroup[], history: HistoryFile): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const group of groups) {
    for (const listing of group.listings) {
      if (listing.source !== 'tracked') continue;
      const entries = history.entries[listing.id] ?? [];
      entries.forEach((entry, index) => {
        const time = parse(entry.releaseDate) ?? parse(entry.detectedAt);
        if (time === null) return;
        const older = entries[index + 1];
        events.push({
          id: `${listing.id}|${historyEntryKey(entry) ?? entry.detectedAt}`,
          group,
          listing,
          version: entry.version,
          previousVersion: older?.version ?? null,
          releaseDate: entry.releaseDate,
          detectedAt: entry.detectedAt,
          releaseNotes: entry.releaseNotes,
          time,
          firstRecorded: index === entries.length - 1,
        });
      });
    }
  }
  return events.sort((a, b) => b.time - a.time || a.group.name.localeCompare(b.group.name));
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** Group events by local calendar day with human labels ("Today", "Yesterday", …). */
export function groupByDay(
  events: readonly TimelineEvent[],
  now: Date = new Date(),
  locale?: string,
): TimelineDay[] {
  const today = dayKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = dayKey(yesterdayDate);
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const withYear = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  const days: TimelineDay[] = [];
  for (const event of events) {
    const date = new Date(event.time);
    const key = dayKey(date);
    let day = days.at(-1);
    if (!day || day.key !== key) {
      const label =
        key === today
          ? 'Today'
          : key === yesterday
            ? 'Yesterday'
            : date.getFullYear() === now.getFullYear()
              ? weekday.format(date)
              : withYear.format(date);
      day = { key, label, events: [] };
      days.push(day);
    }
    day.events.push(event);
  }
  return days;
}
