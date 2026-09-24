import { describe, expect, it } from 'vitest';
import type { AppGroup, Listing } from '../src/lib/groups.ts';
import { buildTimeline, groupByDay } from '../src/lib/timeline.ts';
import type { HistoryFile } from '../src/shared/types.ts';

function listing(id: string, source: 'tracked' | 'local' = 'tracked'): Listing {
  const [platform, storeId] = id.split(':') as ['apple' | 'google', string];
  return {
    id,
    platform,
    storeId,
    name: id,
    developer: null,
    iconUrl: null,
    storeUrl: 'https://example.com',
    currentVersion: null,
    previousVersion: null,
    releaseDate: null,
    releaseNotes: null,
    category: null,
    bundleId: null,
    firstTrackedAt: '2026-09-01T00:00:00.000Z',
    lastCheckedAt: null,
    lastUpdatedAt: null,
    checkStatus: 'ok',
    checkError: null,
    updateDetected: false,
    source,
  };
}

const apple = listing('apple:1');
const google = listing('google:a.b');
const group: AppGroup = {
  key: 'demo',
  name: 'Demo',
  collection: 'ai',
  listings: [apple, google],
  source: 'tracked',
};

const history: HistoryFile = {
  schemaVersion: 1,
  entries: {
    'apple:1': [
      {
        version: '2.0',
        releaseDate: '2026-09-24T09:00:00.000Z',
        releaseNotes: 'New',
        detectedAt: '2026-09-24T10:00:00.000Z',
      },
      {
        version: '1.9',
        releaseDate: '2026-09-10T09:00:00.000Z',
        releaseNotes: 'Old',
        detectedAt: '2026-09-11T00:00:00.000Z',
      },
    ],
    'google:a.b': [
      {
        version: null,
        releaseDate: '2026-09-23T15:00:00.000Z',
        releaseNotes: null,
        detectedAt: '2026-09-23T16:00:00.000Z',
      },
    ],
  },
};

describe('buildTimeline', () => {
  const events = buildTimeline([group], history);

  it('lists every recorded release newest first', () => {
    expect(events.map((e) => e.version)).toEqual(['2.0', null, '1.9']);
  });

  it('links each release to the previous recorded version of the same listing', () => {
    expect(events[0]).toMatchObject({ previousVersion: '1.9', firstRecorded: false });
    expect(events[2]).toMatchObject({ previousVersion: null, firstRecorded: true });
  });

  it('ignores browser-local listings (they have no stored history)', () => {
    const local: AppGroup = { ...group, listings: [listing('apple:1', 'local')], source: 'local' };
    expect(buildTimeline([local], history)).toEqual([]);
  });
});

describe('groupByDay', () => {
  it('labels today, yesterday, and older days', () => {
    const now = new Date(2026, 8, 24, 18, 0); // local time, Sep 24 2026
    const events = buildTimeline([group], history).map((event, index) => ({
      ...event,
      time: [
        new Date(2026, 8, 24, 9).getTime(),
        new Date(2026, 8, 23, 9).getTime(),
        new Date(2026, 8, 10, 9).getTime(),
      ][index]!,
    }));
    const days = groupByDay(events, now, 'en-US');
    expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Thursday, Sep 10']);
    expect(days.map((d) => d.events.length)).toEqual([1, 1, 1]);
  });
});
