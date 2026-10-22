/**
 * Windows desktop versions from winget, the Windows Package Manager.
 *
 * Microsoft's public manifest repository (github.com/microsoft/winget-pkgs)
 * has a folder per package with a subfolder per version, each holding YAML
 * manifests: the installer manifest usually carries the release date, and
 * the locale manifest the publisher, links and often the release notes.
 * Every version is added by a commit titled "New version: <Id> version <v>",
 * so the folder's commit history doubles as a dated version record.
 *
 * Per listing and run this costs two API requests (the folder listing and
 * its recent commits) plus a few raw file reads, which don't count against
 * the API limit.
 */

import { htmlToPlainText } from '../../../src/shared/text.ts';
import { desktopSourceFor, wingetManifestPath } from '../../../src/shared/desktop.ts';
import { compareVersions } from '../../../src/shared/version.ts';
import type { TrackTarget } from '../config.ts';
import type { GitHubClient } from '../github.ts';
import { errorMessage } from '../net.ts';
import type { AppSnapshot, OfficialRelease, ProviderFetch } from './types.ts';
import { asIsoDate, asNonEmptyString, ProviderError } from './types.ts';

const REPO = 'microsoft/winget-pkgs';
const BRANCH = 'master';
/** How many of the newest versions get their exact release date read from the manifest. */
const DATED_VERSIONS = 12;
const MAX_NOTES = 4000;

/* ------------------------------ YAML (subset) ------------------------------ */

function unquote(value: string): string {
  const text = value.trim();
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  return text.replace(/\s+#.*$/, '');
}

/**
 * Top-level scalar keys of a winget manifest. Handles plain, quoted and
 * block (| and >) scalars, which is all winget's manifests use for the
 * fields AppWatch reads; nested lists and maps are skipped.
 */
export function parseManifestYaml(text: string): Record<string, string> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const out: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const match = /^([A-Za-z][A-Za-z0-9]*):(?:\s+(.*))?$/.exec(lines[i]!);
    if (!match) continue;
    const key = match[1]!;
    const rest = (match[2] ?? '').trim();
    const indented: string[] = [];
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]!) || lines[i + 1]!.trim() === '')) {
      indented.push(lines[++i]!);
    }
    while (indented.length > 0 && indented[indented.length - 1]!.trim() === '') indented.pop();

    const block = /^([|>])([+-]?)\s*(?:#.*)?$/.exec(rest);
    if (block) {
      const width = Math.min(
        ...indented.filter((l) => l.trim() !== '').map((l) => /^\s*/.exec(l)![0].length),
      );
      const body = indented.map((l) => (l.trim() === '' ? '' : l.slice(width)));
      out[key] =
        block[1] === '|'
          ? body.join('\n')
          : body
              .join('\n')
              .replace(/([^\n])\n(?=[^\n])/g, '$1 ')
              .replace(/\n\n/g, '\n');
      continue;
    }
    if (rest === '') continue; // a nested list or map
    if (/^["']/.test(rest) || indented.length === 0 || /^\s*-/.test(indented[0] ?? '')) {
      out[key] = unquote(rest);
      continue;
    }
    // A plain scalar continued on indented lines.
    out[key] = [rest, ...indented.map((l) => l.trim())].filter(Boolean).join(' ');
  }
  return out;
}

/** The first value of a key anywhere in the manifest (e.g. per-installer fields). */
function anyValue(text: string, key: string): string | null {
  const match = new RegExp(`^\\s*-?\\s*${key}:\\s*(.+?)\\s*$`, 'm').exec(text);
  return match ? unquote(match[1]!) : null;
}

/* ------------------------------ Version record ----------------------------- */

/**
 * The version a winget commit adds, or null. Titles look like
 * "New version: Spotify.Spotify version 1.2.3 (#12345)",
 * "New package: Microsoft.Outlook version 1.2.3",
 * "Automatic update of Foo.Bar from 1.0 to 1.1" or
 * "Update: Microsoft.Outlook to 1.2026.812.100". Removals don't count.
 */
export function wingetCommitVersion(message: string, packageId: string): string | null {
  const title = message.split('\n', 1)[0]!.trim();
  const patterns = [
    /^(?:New|Add)\s+(?:version|package)\s*:\s*(\S+)\s+version\s+(\S+)/i,
    /^Automatic update of\s+(\S+)\s+from\s+\S+\s+to\s+(\S+)/i,
    /^Update(?:\s+version)?\s*:\s*(\S+)\s+(?:version|to)\s+(\S+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(title);
    if (match && match[1]!.toLowerCase() === packageId.toLowerCase()) {
      return match[2]!.replace(/[,;]$/, '');
    }
  }
  return null;
}

/** A date-only manifest value ("2026-10-19") as noon UTC, so it lands on the same day everywhere. */
export function manifestDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return asIsoDate(`${value}T12:00:00Z`);
  return asIsoDate(value);
}

/**
 * Merge the version folders and the commit history into one dated record,
 * newest version first. A version can't have been released after a newer
 * one, so out-of-order merges (winget sometimes merges a backlog of older
 * versions later) are pulled back to the newer version's date.
 */
export function buildWingetReleases(
  versions: readonly string[],
  manifestDates: ReadonlyMap<string, string>,
  commitDates: ReadonlyMap<string, string>,
): { version: string; releaseDate: string | null }[] {
  const all = new Set([...versions, ...commitDates.keys()]);
  const ordered = [...all].sort((a, b) => compareVersions(b, a));
  let cap = Number.POSITIVE_INFINITY;
  return ordered.map((version) => {
    const iso = manifestDates.get(version) ?? commitDates.get(version) ?? null;
    if (!iso) return { version, releaseDate: null };
    let time = Date.parse(iso);
    if (time > cap) time = cap;
    cap = time;
    return { version, releaseDate: new Date(time).toISOString() };
  });
}

function minimumWindows(value: string | null): string | null {
  const build = value ? /^10\.0\.(\d+)/.exec(value) : null;
  if (!build) return null;
  return Number(build[1]) >= 22000 ? 'Windows 11 or later' : 'Windows 10 or later';
}

function cleanNotes(text: string | undefined): string | null {
  if (!text) return null;
  const plain = (/<[a-z][^>]*>/i.test(text) ? htmlToPlainText(text) : text).trim();
  if (!plain) return null;
  return plain.length > MAX_NOTES ? `${plain.slice(0, MAX_NOTES).trimEnd()}…` : plain;
}

function httpsUrl(value: string | undefined): string | null {
  const url = asNonEmptyString(value);
  return url && /^https:\/\//i.test(url) ? url : null;
}

interface ContentsEntry {
  name: string;
  type: string;
}

interface CommitEntry {
  commit?: { message?: string; author?: { date?: string }; committer?: { date?: string } };
}

export function createWingetProvider(options: {
  github: GitHubClient;
  log?: (message: string) => void;
}): ProviderFetch {
  const { github, log } = options;

  return async (target: TrackTarget): Promise<AppSnapshot> => {
    const source = desktopSourceFor(target.platform, target.storeId);
    if (source?.kind !== 'winget') {
      throw new ProviderError(`Not a winget listing: ${target.platform}:${target.storeId}`);
    }
    const { packageId } = source;
    const path = wingetManifestPath(packageId);

    // 1. Versions: the version folders in the package's directory (other
    //    folders are separate packages, e.g. Mozilla.Firefox.ESR).
    let entries: unknown;
    try {
      entries = await github.api(
        `/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
        `winget:${packageId}`,
      );
    } catch (error) {
      throw new ProviderError(`winget lookup failed for ${packageId}: ${errorMessage(error)}`);
    }
    const versions = (Array.isArray(entries) ? (entries as ContentsEntry[]) : [])
      .filter((entry) => entry.type === 'dir' && /^v?\d/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => compareVersions(b, a));
    const latest = versions[0];
    if (!latest) throw new ProviderError(`winget has no versions of ${packageId}`);

    // 2. When each version was added (recent history; optional).
    const commitDates = new Map<string, string>();
    try {
      const commits = await github.api(
        `/repos/${REPO}/commits?${new URLSearchParams({ path, per_page: '100' })}`,
        `winget:${packageId}:history`,
      );
      for (const entry of Array.isArray(commits) ? (commits as CommitEntry[]) : []) {
        const version = wingetCommitVersion(entry.commit?.message ?? '', packageId);
        const date = asIsoDate(entry.commit?.committer?.date ?? entry.commit?.author?.date);
        if (!version || !date) continue;
        const known = commitDates.get(version);
        if (!known || Date.parse(date) < Date.parse(known)) commitDates.set(version, date);
      }
    } catch (error) {
      log?.(`warning: winget history unavailable for ${packageId} (${errorMessage(error)})`);
    }

    // 3. Manifests: exact release dates for the newest versions, details for the latest.
    const file = (version: string, name: string) =>
      github.raw(REPO, BRANCH, `${path}/${version}/${name}`, `winget:${packageId}:${name}`);
    const manifestDates = new Map<string, string>();
    let latestInstaller: string | null = null;
    const dated = versions.slice(0, DATED_VERSIONS);
    for (let i = 0; i < dated.length; i += 4) {
      const batch = dated.slice(i, i + 4);
      const texts = await Promise.all(
        batch.map((version) =>
          file(version, `${packageId}.installer.yaml`).catch(() => null as string | null),
        ),
      );
      texts.forEach((text, index) => {
        const version = batch[index]!;
        if (version === latest) latestInstaller = text;
        const date = text ? manifestDate(anyValue(text, 'ReleaseDate')) : null;
        if (date) manifestDates.set(version, date);
      });
    }
    let locale: Record<string, string> = {};
    try {
      const versionManifest = await file(latest, `${packageId}.yaml`);
      const defaultLocale = versionManifest
        ? (parseManifestYaml(versionManifest).DefaultLocale ?? 'en-US')
        : 'en-US';
      const localeText =
        (await file(latest, `${packageId}.locale.${defaultLocale}.yaml`)) ??
        (defaultLocale !== 'en-US' ? await file(latest, `${packageId}.locale.en-US.yaml`) : null);
      if (localeText) locale = parseManifestYaml(localeText);
    } catch (error) {
      log?.(`warning: winget details unavailable for ${packageId} (${errorMessage(error)})`);
    }

    const record = buildWingetReleases(versions, manifestDates, commitDates);
    const current = record.find((release) => release.version === latest);
    const releaseUrl = httpsUrl(locale.ReleaseNotesUrl);
    const releaseNotes = cleanNotes(locale.ReleaseNotes);
    const releases: OfficialRelease[] = record
      .filter((release) => release.releaseDate !== null)
      .map((release) => ({
        version: release.version,
        releaseDate: release.releaseDate,
        releaseNotes: release.version === latest ? releaseNotes : null,
        url: release.version === latest ? releaseUrl : null,
      }));

    return {
      platform: 'windows',
      storeId: target.storeId,
      name: asNonEmptyString(locale.PackageName) ?? packageId,
      developer: asNonEmptyString(locale.Publisher),
      iconUrl: null,
      storeUrl: httpsUrl(locale.PackageUrl) ?? httpsUrl(locale.PublisherUrl) ?? source.sourceUrl,
      version: latest,
      releaseDate: current?.releaseDate ?? null,
      releaseNotes,
      category: null,
      bundleId: null,
      price: null,
      contentRating: null,
      requiresOs: minimumWindows(
        latestInstaller ? anyValue(latestInstaller, 'MinimumOSVersion') : null,
      ),
      sizeBytes: null,
      rating: null,
      ratingCount: null,
      developerWebsite: httpsUrl(locale.PublisherUrl),
      releaseUrl,
      releases,
    };
  };
}
