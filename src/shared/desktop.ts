/**
 * Desktop listings (Windows and Mac). Desktop software isn't sold through an
 * app store AppWatch can query, so each desktop listing names where its
 * versions are read from:
 *
 *   "windows": "winget:Spotify.Spotify"   Windows Package Manager (winget)
 *   "mac": "homebrew:spotify"             Homebrew
 *   "windows": "respondus-lockdown-browser"   a vendor release feed (feeds.ts)
 *
 * winget is Microsoft's package manager for Windows; its public manifest
 * repository lists every version of each package with its installer and,
 * usually, its release date and notes. Homebrew is the standard package
 * manager for macOS; its cask catalog follows each app's official download.
 * Both are read-only, keyless and kept current by their maintainers' bots.
 *
 * The stored listing id keeps the prefix: "windows:winget:Spotify.Spotify".
 */

import type { FeedInfo } from './feeds.ts';
import { feedFor } from './feeds.ts';
import type { Platform } from './types.ts';

export type DesktopPlatform = Extract<Platform, 'windows' | 'mac'>;

export const WINGET_PREFIX = 'winget:';
export const HOMEBREW_PREFIX = 'homebrew:';

/** winget PackageIdentifier: 2–8 dot-separated segments without spaces or path characters. */
const WINGET_ID_RE = /^[^.\s\\/:*?"<>|]{1,32}(?:\.[^.\s\\/:*?"<>|]{1,32}){1,7}$/;
/** Homebrew cask token, e.g. "google-chrome" or "firefox@esr". */
const CASK_TOKEN_RE = /^[a-z0-9][a-z0-9@._+-]*$/;

export type DesktopSource =
  | { kind: 'winget'; packageId: string; label: string; sourceUrl: string }
  | { kind: 'homebrew'; token: string; label: string; sourceUrl: string }
  | { kind: 'feed'; feed: FeedInfo; label: string; sourceUrl: string };

/** manifests/s/Spotify/Spotify for "Spotify.Spotify". */
export function wingetManifestPath(packageId: string): string {
  return `manifests/${packageId.charAt(0).toLowerCase()}/${packageId.split('.').join('/')}`;
}

export function isWingetId(value: string): boolean {
  return WINGET_ID_RE.test(value);
}

export function isCaskToken(value: string): boolean {
  return CASK_TOKEN_RE.test(value);
}

/** Where a desktop listing's versions come from, or null for an unknown id. */
export function desktopSourceFor(platform: Platform, storeId: string): DesktopSource | null {
  if (platform === 'windows' && storeId.startsWith(WINGET_PREFIX)) {
    const packageId = storeId.slice(WINGET_PREFIX.length);
    if (!isWingetId(packageId)) return null;
    return {
      kind: 'winget',
      packageId,
      label: 'Windows Package Manager (winget)',
      sourceUrl: `https://github.com/microsoft/winget-pkgs/tree/master/${wingetManifestPath(packageId)}`,
    };
  }
  if (platform === 'mac' && storeId.startsWith(HOMEBREW_PREFIX)) {
    const token = storeId.slice(HOMEBREW_PREFIX.length);
    if (!isCaskToken(token)) return null;
    return {
      kind: 'homebrew',
      token,
      label: 'Homebrew',
      sourceUrl: `https://formulae.brew.sh/cask/${token}`,
    };
  }
  if (platform === 'windows' || platform === 'mac') {
    const feed = feedFor(storeId);
    if (feed && feed.platforms.includes(platform)) {
      return { kind: 'feed', feed, label: feed.sourceLabel, sourceUrl: feed.sourceUrl };
    }
  }
  return null;
}

/**
 * Parse a catalog "windows" / "mac" value into a stored id. Accepts
 * "winget:<PackageIdentifier>", "homebrew:<token>", a formulae.brew.sh cask
 * link, or a release feed id. Returns an error message for anything else.
 */
export function parseDesktopRef(
  value: string,
  platform: DesktopPlatform,
): { storeId: string } | { error: string } {
  const text = value.trim();
  const brewLink = /^https?:\/\/formulae\.brew\.sh\/cask\/([^/?#]+)\/?$/i.exec(text);
  const storeId = brewLink ? `${HOMEBREW_PREFIX}${brewLink[1]!.toLowerCase()}` : text;
  if (desktopSourceFor(platform, storeId)) return { storeId };

  if (storeId.startsWith(WINGET_PREFIX)) {
    return platform === 'windows'
      ? { error: `"${text}" is not a valid winget package id (e.g. "winget:Spotify.Spotify").` }
      : { error: `winget packages are Windows software; use "homebrew:<cask>" for Mac.` };
  }
  if (storeId.startsWith(HOMEBREW_PREFIX)) {
    return platform === 'mac'
      ? { error: `"${text}" is not a valid Homebrew cask (e.g. "homebrew:spotify").` }
      : { error: `Homebrew casks are Mac software; use "winget:<PackageIdentifier>" for Windows.` };
  }
  const feed = feedFor(storeId);
  if (feed) return { error: `release feed "${feed.id}" has no ${platform} releases.` };
  return {
    error:
      platform === 'windows'
        ? `expected "winget:<PackageIdentifier>" (e.g. "winget:Spotify.Spotify") or a release feed id.`
        : `expected "homebrew:<cask>" (e.g. "homebrew:spotify") or a release feed id.`,
  };
}
