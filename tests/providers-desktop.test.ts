import { describe, expect, it, vi } from 'vitest';
import type { TrackTarget } from '../scripts/lib/config.ts';
import type { GitHubClient } from '../scripts/lib/github.ts';
import { createGitHubClient } from '../scripts/lib/github.ts';
import { createDesktopRouter } from '../scripts/lib/providers/desktop.ts';
import {
  caskCommitVersion,
  caskVersion,
  createHomebrewProvider,
} from '../scripts/lib/providers/homebrew.ts';
import {
  buildWingetReleases,
  createWingetProvider,
  manifestDate,
  parseManifestYaml,
  wingetCommitVersion,
} from '../scripts/lib/providers/winget.ts';
import { desktopSourceFor, parseDesktopRef, wingetManifestPath } from '../src/shared/desktop.ts';

const target = (platform: TrackTarget['platform'], storeId: string): TrackTarget => ({
  platform,
  storeId,
  country: 'us',
  language: 'en',
});

/* ------------------------------- desktop ids ------------------------------- */

describe('desktop sources', () => {
  it('describes winget, Homebrew and feed listings', () => {
    expect(desktopSourceFor('windows', 'winget:Spotify.Spotify')).toMatchObject({
      kind: 'winget',
      packageId: 'Spotify.Spotify',
      sourceUrl: 'https://github.com/microsoft/winget-pkgs/tree/master/manifests/s/Spotify/Spotify',
    });
    expect(desktopSourceFor('mac', 'homebrew:google-chrome')).toMatchObject({
      kind: 'homebrew',
      token: 'google-chrome',
      sourceUrl: 'https://formulae.brew.sh/cask/google-chrome',
    });
    expect(desktopSourceFor('windows', 'respondus-lockdown-browser')?.kind).toBe('feed');
    expect(desktopSourceFor('mac', 'winget:Spotify.Spotify')).toBeNull();
    expect(desktopSourceFor('windows', 'homebrew:spotify')).toBeNull();
    expect(desktopSourceFor('apple', 'winget:Spotify.Spotify')).toBeNull();
  });

  it('maps package ids to manifest folders', () => {
    expect(wingetManifestPath('Mozilla.Firefox')).toBe('manifests/m/Mozilla/Firefox');
    expect(wingetManifestPath('DuckDuckGo.DesktopBrowser')).toBe(
      'manifests/d/DuckDuckGo/DesktopBrowser',
    );
  });

  it('parses catalog values with helpful errors', () => {
    expect(parseDesktopRef('winget:Discord.Discord', 'windows')).toEqual({
      storeId: 'winget:Discord.Discord',
    });
    expect(parseDesktopRef('https://formulae.brew.sh/cask/Discord', 'mac')).toEqual({
      storeId: 'homebrew:discord',
    });
    expect(parseDesktopRef('winget:Discord', 'windows')).toHaveProperty('error');
    expect(parseDesktopRef('homebrew:discord', 'windows')).toHaveProperty('error');
    expect(parseDesktopRef('winget:Discord.Discord', 'mac')).toHaveProperty('error');
    expect(parseDesktopRef('discord', 'mac')).toHaveProperty('error');
  });
});

/* ---------------------------------- winget --------------------------------- */

const LOCALE = `# Created with komac v2.13.0
# yaml-language-server: $schema=https://aka.ms/winget-manifest.defaultLocale.1.12.0.schema.json

PackageIdentifier: Telegram.TelegramDesktop
PackageVersion: 7.3.3
PackageLocale: en-US
Publisher: Telegram FZ-LLC
PublisherUrl: https://telegram.org/
PackageName: Telegram Desktop
PackageUrl: https://desktop.telegram.org/
License: GPL-3.0-only
ShortDescription: A cloud-based mobile and desktop messaging app with a focus on security and speed.
Tags:
- chat
- messaging
ReleaseNotes: |-
  - Show TON DNS gift owners as links.
  - Fix several other crashes.

  Thanks to everyone who reported issues.
ReleaseNotesUrl: https://github.com/telegramdesktop/tdesktop/releases/tag/v7.3.3
ManifestType: defaultLocale
ManifestVersion: 1.12.0
`;

const INSTALLER = `PackageIdentifier: Telegram.TelegramDesktop
PackageVersion: 7.3.3
InstallerType: inno
ReleaseDate: 2026-10-21
Installers:
- Architecture: x64
  MinimumOSVersion: 10.0.17763.0
  InstallerUrl: https://td.telegram.org/tx64/tsetup-x64.7.3.3.exe
ManifestType: installer
`;

describe('winget manifests', () => {
  it('reads top-level scalars, block scalars and quoted values', () => {
    const fields = parseManifestYaml(LOCALE);
    expect(fields.PackageName).toBe('Telegram Desktop');
    expect(fields.Publisher).toBe('Telegram FZ-LLC');
    expect(fields.ReleaseNotes).toBe(
      '- Show TON DNS gift owners as links.\n- Fix several other crashes.\n\nThanks to everyone who reported issues.',
    );
    expect(fields.ReleaseNotesUrl).toBe(
      'https://github.com/telegramdesktop/tdesktop/releases/tag/v7.3.3',
    );
    expect(fields.Tags).toBeUndefined();
    expect(
      parseManifestYaml(`A: 'it''s'\nB: "x \\"y\\""\nC: plain # comment\nD: >-\n  one\n  two\n`),
    ).toEqual({ A: "it's", B: 'x "y"', C: 'plain', D: 'one two' });
  });

  it('dates day-only values at noon UTC', () => {
    expect(manifestDate('2026-10-21')).toBe('2026-10-21T12:00:00.000Z');
    expect(manifestDate('2026-10-21T08:00:00Z')).toBe('2026-10-21T08:00:00.000Z');
    expect(manifestDate(null)).toBeNull();
    expect(manifestDate('soon')).toBeNull();
  });

  it('recognizes the commits that add a version', () => {
    const id = 'Zoom.Zoom';
    expect(
      wingetCommitVersion('New version: Zoom.Zoom version 7.2.48556 (7.2.1.48556) (#438569)', id),
    ).toBe('7.2.48556');
    expect(wingetCommitVersion('New package: Zoom.Zoom version 7.0.1', id)).toBe('7.0.1');
    expect(wingetCommitVersion('Automatic update of Zoom.Zoom from 7.1 to 7.2 (#1)', id)).toBe(
      '7.2',
    );
    expect(wingetCommitVersion('Update: Zoom.Zoom to 7.3.0 (#2)', id)).toBe('7.3.0');
    expect(wingetCommitVersion('Remove version: Zoom.Zoom version 6.0 (#3)', id)).toBeNull();
    expect(wingetCommitVersion('New version: Zoom.Zoom.EXE version 7.2 (#4)', id)).toBeNull();
    expect(wingetCommitVersion('New version: zoom.zoom version 7.4 (#5)', id)).toBe('7.4');
  });

  it('merges folders and history newest-first, keeping dates in version order', () => {
    const releases = buildWingetReleases(
      ['2.42304.2', '2.37337.1', '2.9939.4'],
      new Map([['2.42304.2', '2026-10-19T12:00:00.000Z']]),
      new Map([
        // merged out of order: older versions landed after the newest one
        ['2.37337.1', '2026-10-21T17:40:51.000Z'],
        ['2.9939.4', '2026-10-07T01:54:40.000Z'],
        ['2.2553.1', '2026-10-07T01:54:19.000Z'],
      ]),
    );
    expect(releases.map((r) => r.version)).toEqual([
      '2.42304.2',
      '2.37337.1',
      '2.9939.4',
      '2.2553.1',
    ]);
    expect(releases[1]!.releaseDate).toBe('2026-10-19T12:00:00.000Z');
    expect(releases[2]!.releaseDate).toBe('2026-10-07T01:54:40.000Z');
  });
});

describe('winget version numbering changes', () => {
  it('keeps current versions on their own dates when old numbers were higher', () => {
    // Roblox once used 1.6.x in winget and now uses 0.7xx.
    const releases = buildWingetReleases(
      ['0.744', '0.743', '0.726'],
      new Map([['0.744', '2026-10-20T12:00:00.000Z']]),
      new Map([
        ['1.6.2.6660608', '2025-04-01T12:57:33.000Z'],
        ['1.5.0.1', '2023-08-26T01:52:48.000Z'],
        ['0.743', '2026-10-15T18:28:04.000Z'],
        ['0.726', '2026-06-16T09:00:00.000Z'],
      ]),
    );
    const dates = Object.fromEntries(releases.map((r) => [r.version, r.releaseDate]));
    expect(dates['0.744']).toBe('2026-10-20T12:00:00.000Z');
    expect(dates['0.743']).toBe('2026-10-15T18:28:04.000Z');
    expect(dates['0.726']).toBe('2026-06-16T09:00:00.000Z');
    expect(dates['1.6.2.6660608']).toBe('2025-04-01T12:57:33.000Z');
  });

  it('never moves a manifest release date', () => {
    const releases = buildWingetReleases(
      ['3.0', '2.9'],
      new Map([
        ['3.0', '2026-10-01T12:00:00.000Z'],
        ['2.9', '2026-10-05T12:00:00.000Z'],
      ]),
      new Map(),
    );
    expect(releases.map((r) => r.releaseDate)).toEqual([
      '2026-10-01T12:00:00.000Z',
      '2026-10-05T12:00:00.000Z',
    ]);
  });
});

function fakeGitHub(files: Record<string, string>, api: Record<string, unknown>): GitHubClient {
  return {
    api: vi.fn(async (path: string) => {
      const key = Object.keys(api).find((prefix) => path.startsWith(prefix));
      if (!key) throw new Error(`HTTP 404 from api.github.com (${path})`);
      return api[key];
    }),
    raw: vi.fn(async (_repo: string, _ref: string, path: string) => files[path] ?? null),
  };
}

describe('winget provider', () => {
  const base = 'manifests/t/Telegram/TelegramDesktop';
  const github = fakeGitHub(
    {
      [`${base}/7.3.3/Telegram.TelegramDesktop.yaml`]: 'DefaultLocale: en-US\n',
      [`${base}/7.3.3/Telegram.TelegramDesktop.installer.yaml`]: INSTALLER,
      [`${base}/7.3.3/Telegram.TelegramDesktop.locale.en-US.yaml`]: LOCALE,
      [`${base}/7.3.2/Telegram.TelegramDesktop.installer.yaml`]: 'ReleaseDate: 2026-10-14\n',
    },
    {
      [`/repos/microsoft/winget-pkgs/contents/${base}`]: [
        { name: '7.3.2', type: 'dir' },
        { name: '7.3.3', type: 'dir' },
        { name: 'Beta', type: 'dir' },
        { name: '.validation', type: 'file' },
      ],
      '/repos/microsoft/winget-pkgs/commits': [
        {
          commit: {
            message: 'New version: Telegram.TelegramDesktop version 7.3.3 (#458363)',
            committer: { date: '2026-10-22T02:27:41Z' },
          },
        },
        {
          commit: {
            message: 'New version: Telegram.TelegramDesktop.Beta version 7.4.0 (#458000)',
            committer: { date: '2026-10-20T02:27:41Z' },
          },
        },
        {
          commit: {
            message: 'New version: Telegram.TelegramDesktop version 7.3.1 (#450000)',
            committer: { date: '2026-10-08T09:00:00Z' },
          },
        },
      ],
    },
  );
  const provider = createWingetProvider({ github });

  it('reports the newest version with its details and dated history', async () => {
    const snapshot = await provider(target('windows', 'winget:Telegram.TelegramDesktop'));
    expect(snapshot).toMatchObject({
      platform: 'windows',
      storeId: 'winget:Telegram.TelegramDesktop',
      name: 'Telegram Desktop',
      developer: 'Telegram FZ-LLC',
      storeUrl: 'https://desktop.telegram.org/',
      version: '7.3.3',
      // the manifest's release date wins over the merge date
      releaseDate: '2026-10-21T12:00:00.000Z',
      requiresOs: 'Windows 10 or later',
      developerWebsite: 'https://telegram.org/',
      releaseUrl: 'https://github.com/telegramdesktop/tdesktop/releases/tag/v7.3.3',
    });
    expect(snapshot.releaseNotes).toContain('Fix several other crashes.');
    expect(snapshot.releases?.map((r) => [r.version, r.releaseDate])).toEqual([
      ['7.3.3', '2026-10-21T12:00:00.000Z'],
      ['7.3.2', '2026-10-14T12:00:00.000Z'],
      ['7.3.1', '2026-10-08T09:00:00.000Z'],
    ]);
  });

  it('fails clearly for unknown packages and wrong platforms', async () => {
    await expect(provider(target('windows', 'winget:Nobody.Nothing'))).rejects.toThrow(
      /winget lookup failed for Nobody\.Nothing/,
    );
    await expect(provider(target('mac', 'winget:Telegram.TelegramDesktop'))).rejects.toThrow(
      /Not a winget listing/,
    );
  });

  it('still works when the history is unavailable', async () => {
    const noHistory = fakeGitHub(
      { [`${base}/7.3.3/Telegram.TelegramDesktop.installer.yaml`]: 'ManifestType: installer\n' },
      { [`/repos/microsoft/winget-pkgs/contents/${base}`]: [{ name: '7.3.3', type: 'dir' }] },
    );
    const snapshot = await createWingetProvider({ github: noHistory })(
      target('windows', 'winget:Telegram.TelegramDesktop'),
    );
    expect(snapshot.version).toBe('7.3.3');
    expect(snapshot.releaseDate).toBeNull();
    expect(snapshot.name).toBe('Telegram.TelegramDesktop');
    expect(snapshot.releases).toEqual([]);
  });
});

/* --------------------------------- Homebrew -------------------------------- */

describe('Homebrew casks', () => {
  it('strips build ids from versions', () => {
    expect(caskVersion('1.212.0,845')).toBe('1.212.0');
    expect(caskVersion('158.0.1')).toBe('158.0.1');
    expect(caskVersion('latest')).toBeNull();
    expect(caskVersion(null)).toBeNull();
  });

  it('recognizes bump commits', () => {
    expect(caskCommitVersion('spotify 1.3.5.3058', 'spotify')).toBe('1.3.5.3058');
    expect(caskCommitVersion('duckduckgo 1.212.0,845', 'duckduckgo')).toBe('1.212.0');
    expect(caskCommitVersion('google-chrome: update to 156.0.1', 'google-chrome')).toBe('156.0.1');
    expect(caskCommitVersion('spotify: update livecheck', 'spotify')).toBeNull();
    expect(
      caskCommitVersion('Merge pull request #1 from Homebrew/bump-spotify', 'spotify'),
    ).toBeNull();
    expect(caskCommitVersion('firefox@nightly 160.0a1', 'firefox')).toBeNull();
  });

  const info = {
    token: 'duckduckgo',
    name: ['DuckDuckGo'],
    desc: 'Web browser focusing on privacy',
    homepage: 'https://duckduckgo.com/',
    version: '1.212.0,845',
    depends_on: { macos: { '>=': ['12'] } },
    ruby_source_path: 'Casks/d/duckduckgo.rb',
    deprecated: false,
    disabled: false,
  };
  const github = fakeGitHub(
    {},
    {
      '/repos/Homebrew/homebrew-cask/commits': [
        { commit: { message: 'duckduckgo 1.212.0,845', author: { date: '2026-10-19T10:01:30Z' } } },
        {
          commit: {
            message: 'duckduckgo: fix livecheck',
            author: { date: '2026-10-15T00:00:00Z' },
          },
        },
        { commit: { message: 'duckduckgo 1.211.0,840', author: { date: '2026-10-12T09:00:00Z' } } },
      ],
    },
  );

  it('reports the current version, its arrival date and earlier versions', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(info), { status: 200 }));
    const provider = createHomebrewProvider({ github, fetchFn, retries: 0 });
    const snapshot = await provider(target('mac', 'homebrew:duckduckgo'));
    expect(fetchFn).toHaveBeenCalledWith(
      'https://formulae.brew.sh/api/cask/duckduckgo.json',
      expect.anything(),
    );
    expect(snapshot).toMatchObject({
      platform: 'mac',
      storeId: 'homebrew:duckduckgo',
      name: 'DuckDuckGo',
      version: '1.212.0',
      releaseDate: '2026-10-19T10:01:30.000Z',
      requiresOs: 'macOS 12 or later',
      storeUrl: 'https://duckduckgo.com/',
      releaseNotes: null,
    });
    expect(snapshot.releases?.map((r) => r.version)).toEqual(['1.212.0', '1.211.0']);
  });

  it('refuses casks without versions and disabled casks', async () => {
    const latest = vi.fn(
      async () => new Response(JSON.stringify({ ...info, version: 'latest' }), { status: 200 }),
    );
    await expect(
      createHomebrewProvider({ github, fetchFn: latest, retries: 0 })(
        target('mac', 'homebrew:duckduckgo'),
      ),
    ).rejects.toThrow(/no version number/);
    const disabled = vi.fn(
      async () => new Response(JSON.stringify({ ...info, disabled: true }), { status: 200 }),
    );
    await expect(
      createHomebrewProvider({ github, fetchFn: disabled, retries: 0 })(
        target('mac', 'homebrew:duckduckgo'),
      ),
    ).rejects.toThrow(/disabled/);
  });
});

/* ---------------------------- router + GitHub API -------------------------- */

describe('desktop router', () => {
  it('sends each listing to its source', async () => {
    const winget = vi.fn(async () => ({ version: 'w' }) as never);
    const homebrew = vi.fn(async () => ({ version: 'h' }) as never);
    const feed = vi.fn(async () => ({ version: 'f' }) as never);
    const windows = createDesktopRouter({ winget, feed });
    const mac = createDesktopRouter({ homebrew, feed });
    await windows(target('windows', 'winget:A.B'));
    await windows(target('windows', 'respondus-lockdown-browser'));
    await mac(target('mac', 'homebrew:abc'));
    expect(winget).toHaveBeenCalledTimes(1);
    expect(homebrew).toHaveBeenCalledTimes(1);
    expect(feed).toHaveBeenCalledTimes(1);
    expect(() => mac(target('mac', 'winget:A.B'))).toThrow(/No checker/);
  });
});

describe('GitHub client', () => {
  it('sends the token and stops after running out of quota', async () => {
    const fetchFn = vi.fn(
      async () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
    );
    const client = createGitHubClient({ token: 't0k', fetchFn, retries: 2, minIntervalMs: 0 });
    await expect(client.api('/repos/a/b', 'test')).rejects.toThrow(/rate limit/);
    await expect(client.api('/repos/a/c', 'test')).rejects.toThrow(/rate limit/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t0k');
  });

  it('treats a missing raw file as null', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 404 }));
    const client = createGitHubClient({ fetchFn, retries: 2, minIntervalMs: 0 });
    await expect(client.raw('o/r', 'main', 'a b/c.yaml', 'test')).resolves.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://raw.githubusercontent.com/o/r/main/a%20b/c.yaml',
    );
  });
});
