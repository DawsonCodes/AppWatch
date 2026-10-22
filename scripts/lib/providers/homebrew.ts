/**
 * Mac desktop versions from Homebrew, the standard macOS package manager.
 *
 * Each Homebrew "cask" follows one app's official download. Homebrew's JSON
 * API (formulae.brew.sh) gives the current version, and the cask file's
 * history in github.com/Homebrew/homebrew-cask gives when each version
 * arrived: Homebrew's bot opens a "<cask> <version>" commit within hours of
 * a release. Homebrew doesn't carry release notes.
 *
 * Per listing and run: one formulae.brew.sh request and one GitHub API
 * request.
 */

import { desktopSourceFor } from '../../../src/shared/desktop.ts';
import type { TrackTarget } from '../config.ts';
import type { GitHubClient } from '../github.ts';
import { errorMessage, fetchJson, withRetry } from '../net.ts';
import type { AppSnapshot, OfficialRelease, ProviderFetch } from './types.ts';
import { asIsoDate, asNonEmptyString, ProviderError } from './types.ts';

const API = 'https://formulae.brew.sh/api/cask';
const REPO = 'Homebrew/homebrew-cask';

/** "1.212.0,845" -> "1.212.0": Homebrew appends build ids after a comma. */
export function caskVersion(raw: unknown): string | null {
  const text = asNonEmptyString(raw);
  if (!text || text === 'latest') return null;
  return text.split(',')[0]!.trim() || null;
}

/** The version a homebrew-cask commit bumps the cask to ("spotify 1.3.5.3058"), or null. */
export function caskCommitVersion(message: string, token: string): string | null {
  const title = message.split('\n', 1)[0]!.trim();
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}:?\\s+(?:update to\\s+)?v?(\\d[^\\s]*)$`, 'i').exec(title);
  return match ? caskVersion(match[1]) : null;
}

/** depends_on.macos, e.g. { ">=": ["12"] } -> "macOS 12 or later". */
function minimumMacos(dependsOn: unknown): string | null {
  if (typeof dependsOn !== 'object' || dependsOn === null) return null;
  const macos = (dependsOn as { macos?: unknown }).macos;
  if (typeof macos !== 'object' || macos === null) return null;
  const atLeast = (macos as Record<string, unknown>)['>='];
  const first = Array.isArray(atLeast) ? asNonEmptyString(atLeast[0]) : null;
  return first && /^\d+(?:\.\d+)?$/.test(first) ? `macOS ${first} or later` : null;
}

function httpsUrl(value: unknown): string | null {
  const url = asNonEmptyString(value);
  return url && /^https:\/\//i.test(url) ? url : null;
}

interface CommitEntry {
  commit?: { message?: string; author?: { date?: string }; committer?: { date?: string } };
}

export function createHomebrewProvider(options: {
  github: GitHubClient;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
}): ProviderFetch {
  const { github, fetchFn, timeoutMs = 20_000, retries = 2, retryDelayMs = 2000, log } = options;

  return async (target: TrackTarget): Promise<AppSnapshot> => {
    const source = desktopSourceFor(target.platform, target.storeId);
    if (source?.kind !== 'homebrew') {
      throw new ProviderError(`Not a Homebrew listing: ${target.platform}:${target.storeId}`);
    }
    const { token } = source;

    let info: Record<string, unknown>;
    try {
      const raw = await withRetry(
        () => fetchJson(`${API}/${encodeURIComponent(token)}.json`, { timeoutMs, fetchFn }),
        { retries, baseDelayMs: retryDelayMs, label: `homebrew:${token}`, log },
      );
      if (typeof raw !== 'object' || raw === null) throw new Error('unexpected response');
      info = raw as Record<string, unknown>;
    } catch (error) {
      throw new ProviderError(`Homebrew lookup failed for ${token}: ${errorMessage(error)}`);
    }
    if (info.disabled === true) throw new ProviderError(`Homebrew has disabled the ${token} cask`);
    const version = caskVersion(info.version);
    if (!version) throw new ProviderError(`Homebrew lists no version number for ${token}`);

    // When each version arrived, from the cask file's history (optional).
    const sourcePath =
      asNonEmptyString(info.ruby_source_path) ?? `Casks/${token.charAt(0)}/${token}.rb`;
    const arrived = new Map<string, string>();
    try {
      const commits = await github.api(
        `/repos/${REPO}/commits?${new URLSearchParams({ path: sourcePath, per_page: '100' })}`,
        `homebrew:${token}:history`,
      );
      for (const entry of Array.isArray(commits) ? (commits as CommitEntry[]) : []) {
        const bumped = caskCommitVersion(entry.commit?.message ?? '', token);
        // The bump commit's author date is when the new version was spotted.
        const date = asIsoDate(entry.commit?.author?.date ?? entry.commit?.committer?.date);
        if (!bumped || !date) continue;
        const known = arrived.get(bumped);
        if (!known || Date.parse(date) < Date.parse(known)) arrived.set(bumped, date);
      }
    } catch (error) {
      log?.(`warning: Homebrew history unavailable for ${token} (${errorMessage(error)})`);
    }

    const releases: OfficialRelease[] = [...arrived]
      .map(([v, releaseDate]) => ({ version: v, releaseDate, releaseNotes: null, url: null }))
      .sort((a, b) => Date.parse(b.releaseDate) - Date.parse(a.releaseDate));
    const names = Array.isArray(info.name) ? info.name : [];
    const homepage = httpsUrl(info.homepage);

    return {
      platform: 'mac',
      storeId: target.storeId,
      name: asNonEmptyString(names[0]) ?? token,
      developer: null,
      iconUrl: null,
      storeUrl: homepage ?? source.sourceUrl,
      version,
      releaseDate: arrived.get(version) ?? null,
      releaseNotes: null,
      category: null,
      bundleId: null,
      price: null,
      contentRating: null,
      requiresOs: minimumMacos(info.depends_on),
      sizeBytes: null,
      rating: null,
      ratingCount: null,
      developerWebsite: homepage,
      releases,
    };
  };
}
