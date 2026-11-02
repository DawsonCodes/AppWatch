/**
 * Roblox Studio for Windows.
 *
 * Roblox doesn't publish Studio versions through a package catalog (the
 * winget entry only carries the installer), so this reads the Roblox Client
 * Tracker on GitHub: a long-running public repository, followed by many
 * Roblox developers, whose bot commits each new Windows Studio build within
 * hours of deployment, titled with its version ("0.745.0.7451137"). Each of
 * those commits is one release; Roblox's release notes for it are at
 * create.roblox.com/docs/release-notes/release-notes-<minor version>.
 *
 * (Mac Studio comes from Homebrew's "robloxstudio" cask, which follows
 * Roblox's own Mac deployment endpoint.)
 *
 * Per run: two GitHub API requests.
 */

import { feedFor } from '../../../src/shared/feeds.ts';
import type { TrackTarget } from '../config.ts';
import type { GitHubClient } from '../github.ts';
import type { AppSnapshot, OfficialRelease, ProviderFetch } from './types.ts';
import { asIsoDate, ProviderError } from './types.ts';

export const ROBLOX_STUDIO_FEED_ID = 'roblox-studio';
const REPO = 'MaximumADHD/Roblox-Client-Tracker';
const BRANCH = 'roblox';
const PAGES = 2;
const VERSION = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

/** Roblox's release notes page for a Studio version ("0.745.0.7451137" -> notes 745). */
export function robloxReleaseNotesUrl(version: string): string | null {
  const match = VERSION.exec(version);
  return match ? `https://create.roblox.com/docs/release-notes/release-notes-${match[2]}` : null;
}

/**
 * Studio builds from the tracker's commit list, newest first. A build
 * committed more than once (a re-run) counts from its first commit.
 */
export function robloxStudioReleases(commits: readonly unknown[]): OfficialRelease[] {
  const first = new Map<string, string>();
  for (const value of commits) {
    if (typeof value !== 'object' || value === null) continue;
    const commit = (value as Record<string, unknown>).commit as Record<string, unknown> | undefined;
    const message = typeof commit?.message === 'string' ? commit.message.trim() : '';
    const title = message.split('\n', 1)[0]!.trim();
    if (!VERSION.test(title)) continue;
    const author = commit?.author as Record<string, unknown> | undefined;
    const committer = commit?.committer as Record<string, unknown> | undefined;
    const releaseDate = asIsoDate(author?.date) ?? asIsoDate(committer?.date);
    if (!releaseDate) continue;
    const known = first.get(title);
    if (!known || Date.parse(releaseDate) < Date.parse(known)) first.set(title, releaseDate);
  }
  return [...first]
    .map(([version, releaseDate]) => ({
      version,
      releaseDate,
      releaseNotes: null,
      url: robloxReleaseNotesUrl(version),
    }))
    .sort((a, b) => Date.parse(b.releaseDate) - Date.parse(a.releaseDate));
}

export function createRobloxStudioProvider(options: { github: GitHubClient }): ProviderFetch {
  const { github } = options;
  let loaded: Promise<OfficialRelease[]> | null = null;

  async function load(): Promise<OfficialRelease[]> {
    const commits: unknown[] = [];
    for (let page = 1; page <= PAGES; page++) {
      const list = await github.api(
        `/repos/${REPO}/commits?sha=${BRANCH}&per_page=100&page=${page}`,
        'roblox-studio:commits',
      );
      if (!Array.isArray(list) || list.length === 0) break;
      commits.push(...list);
    }
    return robloxStudioReleases(commits);
  }

  return async (target: TrackTarget): Promise<AppSnapshot> => {
    const feed = feedFor(target.storeId);
    if (!feed || feed.id !== ROBLOX_STUDIO_FEED_ID || target.platform !== 'windows') {
      throw new ProviderError(
        `Unknown Roblox Studio listing "${target.platform}:${target.storeId}"`,
      );
    }
    loaded ??= load();
    let releases: OfficialRelease[];
    try {
      releases = await loaded;
    } catch (error) {
      loaded = null;
      throw error;
    }
    const latest = releases[0];
    if (!latest) throw new ProviderError('No Roblox Studio builds found in the tracker');
    return {
      platform: 'windows',
      storeId: feed.id,
      name: feed.product,
      developer: feed.developer,
      iconUrl: null,
      storeUrl: feed.productUrl,
      version: latest.version,
      releaseDate: latest.releaseDate,
      releaseNotes: null,
      category: 'Developer Tools',
      bundleId: null,
      price: 'Free',
      contentRating: null,
      requiresOs: null,
      sizeBytes: null,
      rating: null,
      ratingCount: null,
      developerWebsite: 'https://www.roblox.com/',
      releaseUrl: latest.url,
      releases,
    };
  };
}
