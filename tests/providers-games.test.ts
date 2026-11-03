import { describe, expect, it, vi } from 'vitest';
import type { TrackTarget } from '../scripts/lib/config.ts';
import type { GitHubClient } from '../scripts/lib/github.ts';
import { backfillReleases } from '../scripts/lib/merge.ts';
import { createDesktopRouter } from '../scripts/lib/providers/desktop.ts';
import { createMinecraftProvider, minecraftReleases } from '../scripts/lib/providers/minecraft.ts';
import {
  createRobloxStudioProvider,
  robloxReleaseNotesUrl,
  robloxStudioReleases,
} from '../scripts/lib/providers/robloxStudio.ts';
import {
  createSteamProvider,
  parseStoreDetails,
  patchNotesOf,
  steamIconCandidates,
  steamReleases,
  steamToPlainText,
} from '../scripts/lib/providers/steam.ts';
import type { SteamNewsItem } from '../scripts/lib/providers/steam.ts';
import { desktopSourceFor, parseDesktopRef } from '../src/shared/desktop.ts';
import { validateHistoryFile } from '../src/shared/validate.ts';

const target = (platform: TrackTarget['platform'], storeId: string): TrackTarget => ({
  platform,
  storeId,
  country: 'us',
  language: 'en',
});

function jsonFetch(routes: Record<string, unknown>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!key) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[key]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

/* ---------------------------------- Steam ---------------------------------- */

const day = (iso: string) => Date.parse(iso) / 1000;

/** Shaped like ISteamNews/GetNewsForApp/v2 (fields as Steam returns them). */
const NEWS = {
  appnews: {
    appid: 730,
    newsitems: [
      {
        gid: '1',
        title: 'Counter-Strike 2 Update',
        url: 'https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1',
        is_external_url: true,
        author: 'Valve',
        contents:
          '[h1]MAPS[/h1][list][*]Fixed a bug on Dust II[*]Improved lighting[/list][img]{STEAM_CLAN_IMAGE}/1/a.png[/img]See [url=https://example.com]the blog[/url].',
        feedlabel: 'Community Announcements',
        date: day('2026-10-30T22:10:00Z'),
        feedname: 'steam_community_announcements',
        feed_type: 1,
        appid: 730,
        tags: ['patchnotes'],
      },
      {
        gid: '2',
        title: 'Major tournament this weekend',
        url: 'https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/2',
        is_external_url: true,
        author: 'Valve',
        contents: 'Watch it live.',
        feedlabel: 'Community Announcements',
        date: day('2026-10-28T18:00:00Z'),
        feedname: 'steam_community_announcements',
        feed_type: 1,
        appid: 730,
      },
      {
        gid: '3',
        title: 'Counter-Strike 2 Update',
        url: 'https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3',
        is_external_url: true,
        author: 'Valve',
        contents: '[ MISC ]\n- Stability fixes',
        feedlabel: 'Community Announcements',
        date: day('2026-10-21T21:00:00Z'),
        feedname: 'steam_community_announcements',
        feed_type: 1,
        appid: 730,
        tags: ['patchnotes'],
      },
      {
        gid: '4',
        title: 'News roundup',
        url: 'https://example.com/news',
        is_external_url: true,
        author: 'Some site',
        contents: 'Reposted',
        feedlabel: 'PC Gamer',
        date: day('2026-10-31T10:00:00Z'),
        feedname: 'pcgamer',
        feed_type: 0,
        appid: 730,
      },
    ],
    count: 4,
  },
};

const STORE = {
  '730': {
    success: true,
    data: {
      type: 'game',
      name: 'Counter-Strike 2',
      steam_appid: 730,
      required_age: 0,
      is_free: true,
      developers: ['Valve'],
      publishers: ['Valve'],
      website: 'http://counter-strike.net/',
      genres: [
        { id: '1', description: 'Action' },
        { id: '37', description: 'Free To Play' },
      ],
    },
  },
};

function item(title: string, date: string, tags: string[] = []): SteamNewsItem {
  return { title, contents: '', url: null, date: day(date), tags };
}

describe('Steam patch notes', () => {
  it('reads Steam listings and store links', () => {
    expect(desktopSourceFor('windows', 'steam:730')).toMatchObject({
      kind: 'steam',
      appId: '730',
      storeUrl: 'https://store.steampowered.com/app/730/',
    });
    expect(desktopSourceFor('windows', 'steam:abc')).toBeNull();
    expect(desktopSourceFor('mac', 'steam:730')).toBeNull();
    expect(
      parseDesktopRef('https://store.steampowered.com/app/1086940/Baldurs_Gate_3/', 'windows'),
    ).toEqual({ storeId: 'steam:1086940' });
    expect(parseDesktopRef('steam:730', 'mac')).toHaveProperty('error');
  });

  it('turns announcement markup into plain text', () => {
    const text = steamToPlainText(NEWS.appnews.newsitems[0]!.contents);
    expect(text).toContain('MAPS');
    expect(text).toContain('• Fixed a bug on Dust II');
    expect(text).toContain('See the blog.');
    expect(text).not.toMatch(/\[|STEAM_CLAN_IMAGE|https:/);
  });

  it('counts posts tagged as patch notes or titled like one, since tags are inconsistent', () => {
    const chosen = patchNotesOf([
      item('Naval Update', '2026-10-30T00:00:00Z'),
      item('11 YEARS STRONG', '2026-10-25T00:00:00Z', ['patchnotes']),
      item('Community Crunch 473: Lost Colony Update, and more!', '2026-10-20T00:00:00Z', [
        'patchnotes',
      ]),
      item('Marvel Rivals Version 20261030 Balance Post', '2026-10-19T00:00:00Z'),
      item("Check out what's coming in the Edgerunners 2 Update!", '2026-10-18T00:00:00Z', [
        'patchnotes',
      ]),
    ]);
    expect(chosen.map((i) => i.title)).toEqual([
      'Naval Update',
      '11 YEARS STRONG',
      'Marvel Rivals Version 20261030 Balance Post',
    ]);
  });

  it('otherwise reads titles, skipping announcements about other things', () => {
    const chosen = patchNotesOf([
      item('Hotfix 1.2.3', '2026-10-30T00:00:00Z'),
      item('Update 2.3 is live', '2026-10-20T00:00:00Z'),
      item('Patch 8 coming soon', '2026-10-18T00:00:00Z'),
      item('Developer Update #12', '2026-10-15T00:00:00Z'),
      item('Halloween sale', '2026-10-10T00:00:00Z'),
      item('v0.6.4', '2026-10-01T00:00:00Z'),
    ]);
    expect(chosen.map((i) => i.title)).toEqual(['Hotfix 1.2.3', 'Update 2.3 is live', 'v0.6.4']);
  });

  it('tells real patch notes from other posts (titles seen on Steam)', () => {
    const patches = [
      'NAVAL UPDATE',
      'The Icebind is live now!',
      "Cyberpunk 2077's Edgerunners 2 Update (2.5) is out now!",
      'Patch 2.31',
      'Hotfix #36 Now Live!',
      'Apex Legends: Latest Update - 10/26/2026',
      'Counter-Strike 2 Update',
      'Devoid of Liberty: 7.2.2',
      'Marvel Rivals Version 20261029 Patch Notes',
      'v1.0.5: Bug fixes',
      'The Old Peace: Free Update Available Now',
      '7.41f Gameplay Patch',
      'Room Temperature Fix #33 Now Live!',
    ];
    const notPatches = [
      'PGS 12 Grand Finals Day 3 is LIVE!!',
      'PGS 11 Survival Stage is LIVE!!',
      'PGS 11 Final Stage Day 2 is LIVE!!',
      'PUBG GLOBAL SERIES 9 GRAND FINALS DAY 3 IS LIVE!!',
      'Palworld × Graveyard Keeper 2 Steam Bundle is Out Now!',
      'Global Popularity Poll 2026 Results & New Update',
      'COMMUNITY UPDATE 268',
      'Vote for Rust! The Steam Awards are now live!',
      'REDstreams — Cyberpunk 2077: Edgerunners 2 Update (2.5) is coming!',
      'Take Your Shot in Photo Mode Challenge 3.0',
      'The Old Peace Update Launches December 10',
      'An Update from the Anti Cheat Team - 10/09/2026',
      'Community Update #36 A Very Moddy Christmas',
    ];
    const kept = new Set(
      patchNotesOf([...patches, ...notPatches].map((t) => item(t, '2026-10-01T00:00:00Z'))).map(
        (i) => i.title,
      ),
    );
    expect(patches.filter((t) => !kept.has(t))).toEqual([]);
    expect(notPatches.filter((t) => kept.has(t))).toEqual([]);
  });

  it('records one update per day, newest first, keyed by date', () => {
    const releases = steamReleases([
      item('Hotfix', '2026-10-30T09:00:00Z'),
      item('Hotfix 2', '2026-10-30T18:00:00Z'),
      item('Patch', '2026-10-20T09:00:00Z'),
    ]);
    expect(releases).toHaveLength(2);
    expect(releases[0]).toMatchObject({ version: null, releaseDate: '2026-10-30T18:00:00.000Z' });
    expect(releases[1]!.releaseNotes).toBe('Patch');
  });

  it('reads store details', () => {
    expect(parseStoreDetails(STORE, '730')).toEqual({
      name: 'Counter-Strike 2',
      developer: 'Valve',
      price: 'Free',
      category: 'Action',
      contentRating: null,
      website: 'http://counter-strike.net/',
    });
    expect(parseStoreDetails({ '730': { success: false } }, '730')).toBeNull();
  });

  it('builds a snapshot from news and store data', async () => {
    const steam = createSteamProvider({
      fetchFn: jsonFetch({
        'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/': NEWS,
        'https://store.steampowered.com/api/appdetails': STORE,
      }),
      retries: 0,
    });
    const snapshot = await steam(target('windows', 'steam:730'));
    expect(snapshot).toMatchObject({
      platform: 'windows',
      storeId: 'steam:730',
      name: 'Counter-Strike 2',
      developer: 'Valve',
      version: null,
      releaseDate: '2026-10-30T22:10:00.000Z',
      storeUrl: 'https://store.steampowered.com/app/730/',
      price: 'Free',
      category: 'Action',
    });
    expect(snapshot.releaseNotes).toMatch(/^Counter-Strike 2 Update\n\nMAPS/);
    expect(snapshot.releases).toHaveLength(2); // the tournament and the repost are skipped
  });

  it('still works when the store details are unavailable', async () => {
    const steam = createSteamProvider({
      fetchFn: jsonFetch({ 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/': NEWS }),
      retries: 0,
    });
    const snapshot = await steam(target('windows', 'steam:730'));
    expect(snapshot.developer).toBeNull();
    expect(snapshot.releases).toHaveLength(2);
  });

  it('fails clearly when a game has no patch notes', async () => {
    const steam = createSteamProvider({
      fetchFn: jsonFetch({
        'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/': { appnews: { newsitems: [] } },
      }),
      retries: 0,
    });
    await expect(steam(target('windows', 'steam:730'))).rejects.toThrow(/No patch notes/);
  });

  it('finds game icons, sharpest first', () => {
    const hash = 'a'.repeat(40);
    const icon = 'b'.repeat(40);
    const payload = {
      response: {
        store_items: [
          {
            appid: 730,
            assets: {
              asset_url_format: 'steam/apps/730/${FILENAME}?t=1749053861',
              hero_capsule: 'hero_capsule.jpg',
              hero_capsule_2x: 'hero_capsule_2x.jpg',
              library_capsule: 'library_600x900.jpg',
              library_capsule_2x: 'library_600x900_2x.jpg',
              header: 'header.jpg',
              clan_avatar: hash,
              community_icon: icon,
            },
          },
        ],
      },
    };
    const art = (file: string) =>
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/${file}?t=1749053861`;
    expect(steamIconCandidates(payload, '730')).toEqual([
      `https://avatars.fastly.steamstatic.com/${hash}_full.jpg`,
      art('hero_capsule_2x.jpg'),
      art('hero_capsule.jpg'),
      art('library_600x900_2x.jpg'),
      art('library_600x900.jpg'),
      `https://shared.fastly.steamstatic.com/community_assets/images/apps/730/${icon}.jpg`,
    ]);
  });

  it('ignores missing or odd assets', () => {
    expect(steamIconCandidates({ response: { store_items: [] } }, '730')).toEqual([]);
    const odd = {
      response: {
        store_items: [
          {
            appid: 730,
            assets: {
              clan_avatar: 'x',
              asset_url_format: 'steam/apps/999/${FILENAME}',
              hero_capsule: 'hero.jpg',
            },
          },
        ],
      },
    };
    expect(steamIconCandidates(odd, '730')).toEqual([]);
    const traversal = {
      response: {
        store_items: [
          {
            appid: 730,
            assets: { asset_url_format: 'steam/apps/730/${FILENAME}', hero_capsule: '../x.jpg' },
          },
        ],
      },
    };
    expect(steamIconCandidates(traversal, '730')).toEqual([]);
  });

  it('drops posts the record no longer counts, whichever check recorded them', () => {
    const firstCheck = '2026-11-01T00:00:00.000Z';
    const first = backfillReleases(
      [],
      steamReleases([
        item('Patch A', '2026-10-30T09:00:00Z'),
        item('Patch B', '2026-10-20T09:00:00Z'),
      ]),
      firstCheck,
    );
    // A later check (with a looser filter) adds an esports post…
    const later = backfillReleases(
      first,
      steamReleases([
        item('Patch A', '2026-10-30T09:00:00Z'),
        item('Grand Finals Day 1 is LIVE!!', '2026-10-25T09:00:00Z'),
        item('Patch B', '2026-10-20T09:00:00Z'),
      ]).concat([
        {
          version: null,
          releaseDate: '2026-10-25T09:00:00.000Z',
          releaseNotes: 'Grand Finals Day 1 is LIVE!!',
          url: null,
        },
      ]),
      '2026-11-02T00:00:00.000Z',
      firstCheck,
    );
    expect(later.map((e) => e.releaseNotes)).toContain('Grand Finals Day 1 is LIVE!!');
    // …and the next check, reading the record properly, removes it.
    const fixed = backfillReleases(
      later,
      steamReleases([
        item('Patch A', '2026-10-30T09:00:00Z'),
        item('Patch B', '2026-10-20T09:00:00Z'),
      ]),
      '2026-11-03T00:00:00.000Z',
      firstCheck,
    );
    expect(fixed.map((e) => e.releaseNotes)).toEqual(['Patch A', 'Patch B']);
  });

  it('drops first-check posts the record no longer counts as patch notes', () => {
    const learnedAt = '2026-11-01T00:00:00.000Z';
    const first = backfillReleases(
      [],
      steamReleases([
        item('Patch A', '2026-10-30T09:00:00Z'),
        item('Weekly news update', '2026-10-25T09:00:00Z'),
        item('Patch B', '2026-10-20T09:00:00Z'),
        item('Old patch', '2026-01-10T09:00:00Z'),
      ]),
      learnedAt,
    );
    expect(first).toHaveLength(4);
    // Read again with a stricter filter: the weekly news post is gone, and the
    // record now only reaches back to October (the January patch stays).
    const again = backfillReleases(
      first,
      steamReleases([
        item('Patch A', '2026-10-30T09:00:00Z'),
        item('Patch B', '2026-10-20T09:00:00Z'),
      ]),
      '2026-11-02T00:00:00.000Z',
      learnedAt,
    );
    expect(again.map((e) => e.releaseNotes)).toEqual(['Patch A', 'Patch B', 'Old patch']);
  });

  it('backfills versionless patch notes by date, once', () => {
    const releases = steamReleases([
      item('Patch A', '2026-10-30T09:00:00Z'),
      item('Patch B', '2026-10-20T09:00:00Z'),
    ]);
    const once = backfillReleases([], releases, '2026-10-31T00:00:00.000Z');
    expect(once.map((e) => e.releaseNotes)).toEqual(['Patch A', 'Patch B']);
    const twice = backfillReleases(once, releases, '2026-11-01T00:00:00.000Z');
    expect(twice).toBe(once);
    expect(validateHistoryFile({ schemaVersion: 1, entries: { 'windows:steam:1': once } })).toEqual(
      [],
    );
  });
});

/* -------------------------------- Minecraft -------------------------------- */

/** Shaped like Mojang's version_manifest_v2.json. */
const MANIFEST = {
  latest: { release: '26.3', snapshot: '26.4-snapshot-5' },
  versions: [
    {
      id: '26.4-snapshot-5',
      type: 'snapshot',
      url: 'https://piston-meta.mojang.com/v1/packages/x/26.4-snapshot-5.json',
      time: '2026-10-20T12:23:28+00:00',
      releaseTime: '2026-10-20T12:15:06+00:00',
      sha1: 'x',
      complianceLevel: 1,
    },
    {
      id: '26.3',
      type: 'release',
      url: 'https://piston-meta.mojang.com/v1/packages/y/26.3.json',
      time: '2026-10-07T09:00:00+00:00',
      releaseTime: '2026-10-07T08:50:00+00:00',
      sha1: 'y',
      complianceLevel: 1,
    },
    {
      id: '26.2',
      type: 'release',
      url: 'https://piston-meta.mojang.com/v1/packages/z/26.2.json',
      time: '2026-07-01T09:00:00+00:00',
      releaseTime: '2026-07-01T08:50:00+00:00',
      sha1: 'z',
      complianceLevel: 1,
    },
  ],
};

describe('Minecraft: Java Edition', () => {
  it('keeps full releases only, newest first', () => {
    expect(minecraftReleases(MANIFEST).map((r) => r.version)).toEqual(['26.3', '26.2']);
    expect(minecraftReleases(null)).toEqual([]);
  });

  it('serves Windows and Mac from one request', async () => {
    const fetchFn = jsonFetch({ 'https://piston-meta.mojang.com/': MANIFEST });
    const minecraft = createMinecraftProvider({ fetchFn, retries: 0 });
    const windows = await minecraft(target('windows', 'minecraft-java'));
    const mac = await minecraft(target('mac', 'minecraft-java'));
    expect(windows).toMatchObject({
      version: '26.3',
      releaseDate: '2026-10-07T08:50:00.000Z',
      name: 'Minecraft: Java Edition',
    });
    expect(mac.platform).toBe('mac');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------- Roblox Studio ------------------------------ */

const commit = (message: string, date: string) => ({
  sha: message,
  commit: { message, author: { date }, committer: { date } },
});

const COMMITS = [
  commit('Revise README content for clarity and accuracy', '2026-10-27T10:54:28Z'),
  commit('0.745.0.7451137', '2026-10-27T10:16:07+00:00'),
  commit('0.745.0.7451137 (CSV)', '2026-10-27T10:16:07+00:00'),
  commit('0.744.0.7441077', '2026-10-20T20:33:11-05:00'),
  commit('0.744.0.7441077', '2026-10-21T08:00:00Z'), // a re-run
];

describe('Roblox Studio', () => {
  it('reads one release per build, from its first commit', () => {
    const releases = robloxStudioReleases(COMMITS);
    expect(releases).toEqual([
      {
        version: '0.745.0.7451137',
        releaseDate: '2026-10-27T10:16:07.000Z',
        releaseNotes: null,
        url: 'https://create.roblox.com/docs/release-notes/release-notes-745',
      },
      {
        version: '0.744.0.7441077',
        releaseDate: '2026-10-21T01:33:11.000Z',
        releaseNotes: null,
        url: 'https://create.roblox.com/docs/release-notes/release-notes-744',
      },
    ]);
    expect(robloxReleaseNotesUrl('not a version')).toBeNull();
  });

  it('builds the Windows snapshot from the tracker', async () => {
    const github: GitHubClient = {
      api: vi.fn(async (path: string) => (path.includes('page=1') ? COMMITS : [])),
      raw: vi.fn(async () => null),
    };
    const studio = createRobloxStudioProvider({ github });
    const snapshot = await studio(target('windows', 'roblox-studio'));
    expect(snapshot).toMatchObject({
      name: 'Roblox Studio',
      version: '0.745.0.7451137',
      releaseUrl: 'https://create.roblox.com/docs/release-notes/release-notes-745',
    });
    expect(snapshot.releases).toHaveLength(2);
    await expect(studio(target('mac', 'roblox-studio'))).rejects.toThrow();
  });

  it('is routed by feed id', async () => {
    const studio = vi.fn(async () => ({ version: 's' }) as never);
    const minecraft = vi.fn(async () => ({ version: 'm' }) as never);
    const steam = vi.fn(async () => ({ version: 'g' }) as never);
    const windows = createDesktopRouter({
      steam,
      feeds: { 'roblox-studio': studio, 'minecraft-java': minecraft },
    });
    await windows(target('windows', 'roblox-studio'));
    await windows(target('windows', 'minecraft-java'));
    await windows(target('windows', 'steam:730'));
    expect(studio).toHaveBeenCalledTimes(1);
    expect(minecraft).toHaveBeenCalledTimes(1);
    expect(steam).toHaveBeenCalledTimes(1);
    expect(() => windows(target('windows', 'respondus-lockdown-browser'))).toThrow(/No checker/);
  });
});
