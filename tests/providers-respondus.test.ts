import { describe, expect, it, vi } from 'vitest';
import {
  announcementNotes,
  bylineDate,
  parseLooseDate,
  createRespondusProvider,
  parseAnnouncements,
} from '../scripts/lib/providers/respondus.ts';
import type { TrackTarget } from '../scripts/lib/config.ts';

/** Shaped like the Zendesk Help Center API's article objects. */
function article(id: number, title: string, createdAt: string, body = '<p>Notes</p>') {
  return {
    id,
    url: `https://support.respondus.com/api/v2/help_center/en-us/articles/${id}.json`,
    html_url: `https://support.respondus.com/hc/en-us/articles/${id}`,
    title,
    name: title,
    body,
    draft: false,
    created_at: createdAt,
    edited_at: createdAt,
    section_id: 4409696144411,
  };
}

const ARTICLES = [
  article(
    56483671408667,
    'LockDown Browser for Windows, Version 2.1.6.02',
    '2026-09-28T15:00:00Z',
    '<p>Posted by Respondus Support on 28 September 2026</p><p>This update includes a minor fix.</p><ul><li>Existing installs will be auto-updated shortly.</li></ul>',
  ),
  article(56366203691419, 'LockDown Browser for Windows, version 2.1.6.01', '2026-09-26T15:00:00Z'),
  article(46365432129691, 'LockDown Browser for Mac, version 2.1.5.00', '2026-02-06T15:00:00Z'),
  article(41665739453979, 'LockDown Browser for Mac, version 2.1.4.01', '2025-10-01T15:00:00Z'),
  article(1, 'Respondus Monitor: new features', '2026-09-01T15:00:00Z'),
  article(2, 'Moodle extension update', '2026-10-20T15:00:00Z'),
  {
    ...article(3, 'LockDown Browser for Windows, version 9.9.9.99', '2026-10-01T15:00:00Z'),
    draft: true,
  },
];

const windowsTarget: TrackTarget = {
  platform: 'windows',
  storeId: 'respondus-lockdown-browser',
  country: 'us',
  language: 'en',
};
const macTarget: TrackTarget = { ...windowsTarget, platform: 'mac' };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('announcementNotes', () => {
  it('turns the announcement into plain text without the byline', () => {
    expect(
      announcementNotes(
        '<p>Posted by Respondus Support on 28 September 2026</p><p>Fixes &amp; security.</p>',
      ),
    ).toBe('Fixes & security.');
    expect(
      announcementNotes('<p>Posted by Respondus Support on 2026-09-26</p><p>Passkey support.</p>'),
    ).toBe('Passkey support.');
    expect(announcementNotes('<p>Posted by Respondus Support on 2 July 2025</p>')).toBeNull();
    expect(announcementNotes('')).toBeNull();
  });
});

describe('parseAnnouncements', () => {
  it('splits releases by platform, newest first, ignoring drafts and other posts', () => {
    const { windows, mac } = parseAnnouncements(ARTICLES);
    expect(windows.map((r) => r.version)).toEqual(['2.1.6.02', '2.1.6.01']);
    expect(mac.map((r) => r.version)).toEqual(['2.1.5.00', '2.1.4.01']);
    expect(windows[0]).toEqual({
      version: '2.1.6.02',
      releaseDate: '2026-09-28T15:00:00.000Z',
      releaseNotes:
        'This update includes a minor fix.\n• Existing installs will be auto-updated shortly.',
      url: 'https://support.respondus.com/hc/en-us/articles/56483671408667',
    });
  });

  it('keeps the earliest announcement of a version posted twice', () => {
    const { windows } = parseAnnouncements([
      article(10, 'LockDown Browser for Windows, version 2.1.5.00', '2026-06-25T00:00:00Z'),
      article(
        11,
        'Reminder: LockDown Browser for Windows, version 2.1.5.00',
        '2026-07-02T00:00:00Z',
      ),
    ]);
    expect(windows).toHaveLength(1);
    expect(windows[0]?.releaseDate).toBe('2026-06-25T00:00:00.000Z');
  });

  it('accepts title variations', () => {
    const { windows, mac } = parseAnnouncements([
      article(
        20,
        'LockDown Browser for Windows (32-bit), Version 2.1.3.08',
        '2026-01-10T00:00:00Z',
      ),
      article(21, 'LockDown Browser for macOS, version 2.1.6.00', '2026-09-20T00:00:00Z'),
      article(22, 'Lockdown browser for windows - version 2.1.6.03', '2026-10-10T00:00:00Z'),
    ]);
    expect(windows.map((r) => r.version)).toEqual(['2.1.6.03', '2.1.3.08']);
    expect(mac.map((r) => r.version)).toEqual(['2.1.6.00']);
  });
});

describe('createRespondusProvider', () => {
  function stubFetch(pages: Record<string, unknown>) {
    return vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const key = Object.keys(pages).find((prefix) => url.includes(prefix));
      return key ? jsonResponse(pages[key]) : jsonResponse({ error: 'not found' }, 404);
    }) as unknown as typeof fetch;
  }

  it('reports the latest release with the full official history', async () => {
    const fetchFn = stubFetch({
      '/sections/4409696144411/articles.json': { articles: ARTICLES.slice(0, 4), next_page: null },
      '/articles/search.json': { results: ARTICLES.slice(4), next_page: null },
    });
    const provider = createRespondusProvider({ fetchFn, retries: 0 });
    const windows = await provider(windowsTarget);
    expect(windows).toMatchObject({
      platform: 'windows',
      storeId: 'respondus-lockdown-browser',
      name: 'LockDown Browser',
      developer: 'Respondus, Inc.',
      version: '2.1.6.02',
      releaseDate: '2026-09-28T15:00:00.000Z',
      releaseUrl: 'https://support.respondus.com/hc/en-us/articles/56483671408667',
    });
    expect(windows.releases?.map((r) => r.version)).toEqual(['2.1.6.02', '2.1.6.01']);
    const mac = await provider(macTarget);
    expect(mac.version).toBe('2.1.5.00');
    // Announcements are fetched once per run and shared by both platforms.
    expect(vi.mocked(fetchFn).mock.calls).toHaveLength(3);
  });

  it('follows pagination within the help center only', async () => {
    const fetchFn = stubFetch({
      'page=2': { articles: [ARTICLES[2]], next_page: 'https://evil.example/next' },
      '/sections/4409696144411/articles.json': {
        articles: [ARTICLES[0]],
        next_page:
          'https://support.respondus.com/api/v2/help_center/en-us/sections/4409696144411/articles.json?page=2',
      },
      '/articles/search.json': { results: [], next_page: null },
    });
    const provider = createRespondusProvider({ fetchFn, retries: 0 });
    expect((await provider(macTarget)).version).toBe('2.1.5.00');
    const urls = vi.mocked(fetchFn).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('evil.example'))).toBe(false);
  });

  it('still works when the search endpoint fails', async () => {
    const fetchFn = stubFetch({
      '/sections/4409696144411/articles.json': { articles: ARTICLES, next_page: null },
    });
    const log = vi.fn();
    const provider = createRespondusProvider({ fetchFn, retries: 0, log });
    expect((await provider(windowsTarget)).version).toBe('2.1.6.02');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('help-center request failed'));
  });

  it('fails clearly when the help center is unreachable or has no releases', async () => {
    const down = createRespondusProvider({ fetchFn: stubFetch({}), retries: 0 });
    await expect(down(windowsTarget)).rejects.toThrow(/help center unavailable/);
    const empty = createRespondusProvider({
      fetchFn: stubFetch({
        '/sections/': { articles: [ARTICLES[4]], next_page: null },
        '/articles/search.json': { results: [], next_page: null },
      }),
      retries: 0,
    });
    await expect(empty(macTarget)).rejects.toThrow(/No "LockDown Browser for Mac"/);
  });

  it('rejects listings that are not part of this feed', async () => {
    const provider = createRespondusProvider({ fetchFn: stubFetch({}), retries: 0 });
    await expect(provider({ ...windowsTarget, storeId: 'something-else' })).rejects.toThrow(
      /Unknown release feed/,
    );
    await expect(provider({ ...windowsTarget, platform: 'apple' })).rejects.toThrow(
      /no apple releases/,
    );
  });
});

describe('announcement dates', () => {
  it('parses the date formats Respondus uses', () => {
    expect(parseLooseDate('16 June 2021')).toBe('2021-06-16T12:00:00.000Z');
    expect(parseLooseDate('6 February, 2026')).toBe('2026-02-06T12:00:00.000Z');
    expect(parseLooseDate('02 December 2021')).toBe('2021-12-02T12:00:00.000Z');
    expect(parseLooseDate('June 16, 2021')).toBe('2021-06-16T12:00:00.000Z');
    expect(parseLooseDate('2026-09-26')).toBe('2026-09-26T12:00:00.000Z');
    expect(parseLooseDate('31 February 2021')).toBeNull();
    expect(parseLooseDate('soon')).toBeNull();
  });

  it('reads the byline', () => {
    expect(bylineDate('<p>Posted by Respondus Support on 16 June 2021</p><p>x</p>')).toBe(
      '2021-06-16T12:00:00.000Z',
    );
    expect(bylineDate('<p>No byline here.</p>')).toBeNull();
  });

  it('uses the byline date for posts migrated with a later creation date', () => {
    const { mac, windows } = parseAnnouncements([
      article(
        4413042227483,
        'LockDown Browser for Mac, Version 2.0.7.04',
        '2021-12-16T18:00:00Z',
        '<p>Posted by Respondus Support on 16 June 2021</p><p>Hotfix.</p>',
      ),
      article(
        56483671408667,
        'LockDown Browser for Windows, Version 2.1.6.02',
        '2026-09-28T22:40:38Z',
        '<p>Posted by Respondus Support on 28 September 2026</p><p>Fix.</p>',
      ),
    ]);
    expect(mac[0]?.releaseDate).toBe('2021-06-16T12:00:00.000Z');
    // Same day as the post: keep the precise creation time.
    expect(windows[0]?.releaseDate).toBe('2026-09-28T22:40:38.000Z');
  });
});
