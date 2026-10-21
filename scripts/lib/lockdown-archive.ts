/** Optional private installer archive. Nothing here is included in the public data/site. */
import { createHash } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { htmlToPlainText } from '../../src/shared/text.ts';

export const ARCHIVE_REPO = 'DawsonCodes/dawson-bot';
const REPO_ID = 1422709731;
const API = 'https://api.github.com/repos/' + ARCHIVE_REPO;
const MAX_INSTALLER_BYTES = 400 * 1024 * 1024;
const VERSION = /^\d+(?:\.\d+){1,4}$/;
const MSI_MAGIC = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppWatchArchive/1.0 (+https://github.com/DawsonCodes/AppWatch)';

interface Asset {
  id: number;
  name: string;
  size: number;
  state: string;
  digest: string | null;
  browser_download_url: string;
}
interface Release {
  id: number;
  tag_name: string;
  html_url: string;
  assets: Asset[];
}
export interface ArchiveManifest {
  schemaVersion: 1;
  platform: 'windows';
  version: string;
  archivedAt: string;
  downloadPageUrl: string;
  installerUrl: string;
  sha256: string;
  sizeBytes: number;
  releaseTag: string;
  releaseUrl: string;
  assetId: number;
  assetName: string;
  downloadUrl: string;
  versionEvidence: 'Respondus download page and versioned MSI URL';
}
export interface ArchiveOptions {
  token: string;
  version: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
  /** Dependency seam for synthetic installer tests; production uses the fixed bound above. */
  maxInstallerBytes?: number;
}
export interface ArchiveResult {
  status: 'archived' | 'already-archived';
  version: string;
  manifestPath: string;
}

function validVersion(version: unknown): version is string {
  return typeof version === 'string' && version.length <= 40 && VERSION.test(version);
}
function pageUrl(value: unknown): URL {
  if (typeof value !== 'string') throw new Error('Private archive download page is missing.');
  const url = new URL(value);
  const id = url.searchParams.get('ID') ?? url.searchParams.get('id');
  if (
    url.origin !== 'https://download.respondus.com' ||
    url.pathname !== '/lockdown/download.php' ||
    !/^\d{9}$/.test(id ?? '') ||
    url.username ||
    url.password ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => !['ID', 'id'].includes(key))
  ) {
    throw new Error('Private archive must use an official institution download page.');
  }
  return url;
}

/** Only follow the actual vendor links on the page; never guess historical URLs. */
export function installerFromHtml(html: string, page: URL, version: string): URL | null {
  const shown = /\bVersion:\s*(\d+(?:\.\d+){1,4})\b/i.exec(htmlToPlainText(html))?.[1];
  if (shown !== version) {
    throw new Error('The school download has not reached the detected version; retry next check.');
  }
  const id = page.searchParams.get('ID') ?? page.searchParams.get('id');
  for (const match of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const url = new URL(match[1]!.replace(/&amp;/g, '&'), page);
    const expected =
      '/installs/' +
      version +
      '/' +
      id +
      '/LockDownBrowser-' +
      version.replaceAll('.', '-') +
      '-' +
      id +
      '.msi';
    if (
      url.origin === 'https://downloads.respondus.com' &&
      url.pathname === expected &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
      return url;
  }
  return null;
}

async function bounded(response: Response, maximum: number): Promise<Buffer> {
  if (!response.body) throw new Error('Archive response has no body.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('Archive response exceeds its size limit.');
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function archiveLockdown(options: ArchiveOptions): Promise<ArchiveResult> {
  const { token, version, fetchFn = fetch, now = () => new Date() } = options;
  if (!token || !validVersion(version))
    throw new Error('Archive token and a valid version are required.');
  const maximum = Math.min(options.maxInstallerBytes ?? MAX_INSTALLER_BYTES, MAX_INSTALLER_BYTES);
  const manifestPath = 'lockdown-archive/windows/' + version + '.json';
  const tag = 'lockdown-windows-' + version;

  async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T | null> {
    const response = await fetchFn(API + path, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
        'Content-Type': 'application/json',
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (response.status === 404 && method === 'GET') {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Private archive GitHub request failed (HTTP ' + response.status + ').');
    }
    return JSON.parse((await bounded(response, 2_000_000)).toString('utf8')) as T;
  }

  // A typo or unexpectedly public destination must fail before any vendor download or upload.
  const repo = await api<{ id: number; private: boolean }>('');
  if (repo?.id !== REPO_ID || repo.private !== true) {
    throw new Error('Archive destination must be the existing private Dawson Bot repository.');
  }
  async function readFile(path: string): Promise<unknown | null> {
    const file = await api<{ encoding: string; content: string; type: string }>(
      '/contents/' + path + '?ref=main',
    );
    if (!file) return null;
    if (file.type !== 'file' || file.encoding !== 'base64')
      throw new Error('Invalid private archive file.');
    return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) as unknown;
  }
  function verifyAsset(
    asset: Asset | undefined,
    hash: string,
    size: number,
  ): asserts asset is Asset {
    if (
      !asset ||
      !Number.isSafeInteger(asset.id) ||
      asset.state !== 'uploaded' ||
      asset.size !== size ||
      asset.digest !== 'sha256:' + hash
    ) {
      throw new Error(
        'GitHub did not confirm the installer size and SHA-256. Archive is incomplete.',
      );
    }
  }
  const saved = (await readFile(manifestPath)) as ArchiveManifest | null;
  if (saved) {
    if (
      saved.schemaVersion !== 1 ||
      saved.version !== version ||
      saved.platform !== 'windows' ||
      !/^[a-f0-9]{64}$/.test(saved.sha256) ||
      saved.releaseTag !== tag
    ) {
      throw new Error('Existing archive manifest is invalid; it will not be overwritten.');
    }
    const release = await api<Release>('/releases/tags/' + tag);
    verifyAsset(
      release?.assets.find((a) => a.id === saved.assetId && a.name === saved.assetName),
      saved.sha256,
      saved.sizeBytes,
    );
    return { status: 'already-archived', version, manifestPath };
  }
  const config = (await readFile('lockdown-archive/config.json')) as {
    schemaVersion?: number;
    platform?: string;
    downloadPageUrl?: string;
  } | null;
  if (config?.schemaVersion !== 1 || config.platform !== 'windows') {
    throw new Error('Private Windows archive configuration is missing.');
  }
  const page = pageUrl(config.downloadPageUrl);
  async function vendorHtml(url: URL): Promise<string> {
    const response = await fetchFn(url.href, {
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Respondus download page is unavailable (HTTP ' + response.status + ').');
    }
    return (await bounded(response, 500_000)).toString('utf8');
  }
  let html = await vendorHtml(page);
  let installer = installerFromHtml(html, page, version);
  if (!installer) {
    const id = page.searchParams.get('ID') ?? page.searchParams.get('id');
    const found = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
      .map((match) => new URL(match[1]!.replace(/&amp;/g, '&'), page))
      .find(
        (url) =>
          url.origin === page.origin &&
          url.pathname === '/lockdown/download7.php' &&
          url.searchParams.get('id') === id &&
          [...url.searchParams.keys()].every((k) => k === 'id') &&
          !url.username &&
          !url.password &&
          !url.hash,
      );
    if (!found) throw new Error('Respondus did not provide a supported Windows download link.');
    html = await vendorHtml(found);
    installer = installerFromHtml(html, page, version);
  }
  if (!installer) throw new Error('Respondus did not provide the versioned MSI download.');

  const directory = await mkdtemp(join(tmpdir(), 'appwatch-lockdown-'));
  const filePath = join(directory, 'installer.msi');
  try {
    const response = await fetchFn(installer.href, {
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(300_000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/octet-stream' },
    });
    if (
      !response.ok ||
      !response.body ||
      /text\/html|application\/json/i.test(response.headers.get('content-type') ?? '')
    ) {
      await response.body?.cancel();
      throw new Error('Respondus did not return an installer.');
    }
    const declared = Number(response.headers.get('content-length'));
    if (declared > maximum) {
      await response.body.cancel();
      throw new Error('Installer exceeds the archive size limit.');
    }
    const file = await open(filePath, 'wx', 0o600);
    const hash = createHash('sha256');
    const reader = response.body.getReader();
    let size = 0;
    let prefix = Buffer.alloc(0);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) throw new Error('Installer exceeds the archive size limit.');
        if (prefix.length < 8) prefix = Buffer.concat([prefix, value]).subarray(0, 8);
        hash.update(value);
        await file.writeFile(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      await file.close();
    }
    if (size < 8 || !prefix.equals(MSI_MAGIC) || (declared > 0 && declared !== size)) {
      throw new Error('Installer is truncated or is not an MSI; nothing was archived.');
    }
    const sha256 = hash.digest('hex');
    const assetName = 'LockDownBrowser-windows-' + version + '-' + sha256.slice(0, 12) + '.msi';
    let release = await api<Release>('/releases/tags/' + tag);
    release ??= await api<Release>('/releases', 'POST', {
      tag_name: tag,
      target_commitish: 'main',
      name: 'LockDown Browser for Windows ' + version,
      body: 'Private institution installer archive. SHA-256: ' + sha256,
      draft: false,
      prerelease: false,
      make_latest: 'false',
    });
    if (!release || !Number.isSafeInteger(release.id) || release.tag_name !== tag) {
      throw new Error('GitHub did not create the expected private archive release.');
    }
    let asset = release.assets.find((a) => a.name === assetName);
    if (!asset) {
      const body = await openAsBlob(filePath, { type: 'application/octet-stream' });
      const uploaded = await fetchFn(
        'https://uploads.github.com/repos/' +
          ARCHIVE_REPO +
          '/releases/' +
          release.id +
          '/assets?name=' +
          encodeURIComponent(assetName),
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(300_000),
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2026-03-10',
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(size),
          },
          body,
        },
      );
      if (!uploaded.ok) {
        await uploaded.body?.cancel();
        throw new Error('Private installer upload failed (HTTP ' + uploaded.status + ').');
      }
      asset = JSON.parse((await bounded(uploaded, 2_000_000)).toString('utf8')) as Asset;
    }
    verifyAsset(asset, sha256, size);
    const manifest: ArchiveManifest = {
      schemaVersion: 1,
      platform: 'windows',
      version,
      archivedAt: now().toISOString(),
      downloadPageUrl: page.href,
      installerUrl: installer.href,
      sha256,
      sizeBytes: size,
      releaseTag: tag,
      releaseUrl: release.html_url,
      assetId: asset.id,
      assetName,
      downloadUrl: asset.browser_download_url,
      versionEvidence: 'Respondus download page and versioned MSI URL',
    };
    // Only write the manifest after GitHub confirms a complete, matching upload.
    // Contents API creates one path on the current main tree, retaining bot record writes.
    await api('/contents/' + manifestPath, 'PUT', {
      message: 'Archive LockDown Browser Windows ' + version + ' [skip ci]',
      branch: 'main',
      content: Buffer.from(JSON.stringify(manifest, null, 2) + '\n').toString('base64'),
    });
    return { status: 'archived', version, manifestPath };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
