import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { archiveLockdown, installerFromHtml } from '../scripts/lib/lockdown-archive.ts';

const page = new URL('https://download.respondus.com/lockdown/download.php?ID=123456789');
const version = '2.1.6.02';
const installer =
  'https://downloads.respondus.com/installs/2.1.6.02/123456789/LockDownBrowser-2-1-6-02-123456789.msi';
const payload = Buffer.concat([
  Buffer.from('d0cf11e0a1b11ae1', 'hex'),
  Buffer.from('SYNTHETIC_MSI_FIXTURE_ONLY'),
]);
const hash = createHash('sha256').update(payload).digest('hex');
const assetName = 'LockDownBrowser-windows-' + version + '-' + hash.slice(0, 12) + '.msi';
const tag = 'lockdown-windows-' + version;
const html = '<p>Version: ' + version + '</p><a href="' + installer + '">Download</a>';
const asset = {
  id: 12,
  name: assetName,
  state: 'uploaded',
  size: payload.length,
  digest: 'sha256:' + hash,
  browser_download_url:
    'https://github.com/DawsonCodes/dawson-bot/releases/download/' + tag + '/' + assetName,
};
const release = {
  id: 7,
  tag_name: tag,
  html_url: 'https://github.com/DawsonCodes/dawson-bot/releases/tag/' + tag,
  assets: [],
};
const config = { schemaVersion: 1, platform: 'windows', downloadPageUrl: page.href };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const content = (value: unknown) =>
  json({
    type: 'file',
    encoding: 'base64',
    content: Buffer.from(JSON.stringify(value)).toString('base64'),
  });

function fixture(
  options: {
    publicRepo?: boolean;
    saved?: unknown;
    downloadHtml?: string;
    bytes?: Buffer;
    length?: number;
    uploadFails?: boolean;
    badDigest?: boolean;
    releasedAsset?: boolean;
    missingAsset?: boolean;
    manifestFails?: boolean;
  } = {},
) {
  const events: string[] = [];
  let written: Record<string, unknown> | undefined;
  let parsedManifest: Record<string, unknown> | undefined;
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (
      url.startsWith('https://download.respondus.com') ||
      url.startsWith('https://downloads.respondus.com')
    ) {
      expect(headers.has('authorization')).toBe(false);
      expect(init?.redirect).toBe('error');
      if (url === page.href) {
        events.push('page');
        return new Response(options.downloadHtml ?? html);
      }
      if (url === 'https://download.respondus.com/lockdown/download7.php?id=123456789') {
        events.push('download-page');
        return new Response(html);
      }
      if (url === installer) {
        events.push('installer');
        const bytes = options.bytes ?? payload;
        return new Response(new Uint8Array(bytes), {
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': String(options.length ?? bytes.length),
          },
        });
      }
      throw new Error('Unexpected vendor request');
    }
    expect(headers.get('authorization')).toBe('Bearer TEST_ONLY');
    expect(init?.redirect).toBe('error');
    if (url === 'https://api.github.com/repos/DawsonCodes/dawson-bot')
      return json({ id: 1422709731, private: !options.publicRepo });
    if (url.includes('/contents/lockdown-archive/config.json')) return content(config);
    if (url.includes('/contents/lockdown-archive/windows/')) {
      if (init?.method === 'PUT') {
        events.push('manifest');
        written = JSON.parse(String(init.body)) as Record<string, unknown>;
        parsedManifest = JSON.parse(
          Buffer.from(String(written.content), 'base64').toString('utf8'),
        ) as Record<string, unknown>;
        return options.manifestFails ? json({}, 409) : json({ content: { sha: 'fixture' } }, 201);
      }
      return options.saved ? content(options.saved) : json({}, 404);
    }
    if (url.includes('/releases/tags/')) {
      return options.saved || options.releasedAsset
        ? json({ ...release, assets: options.missingAsset ? [] : [asset] })
        : json({}, 404);
    }
    if (url === 'https://api.github.com/repos/DawsonCodes/dawson-bot/releases') {
      events.push('release');
      return json(release, 201);
    }
    if (
      url.startsWith('https://uploads.github.com/repos/DawsonCodes/dawson-bot/releases/7/assets?')
    ) {
      events.push('upload');
      expect(Buffer.from(await (init?.body as Blob).arrayBuffer())).toEqual(payload);
      return options.uploadFails
        ? json({}, 503)
        : json({ ...asset, digest: options.badDigest ? 'sha256:bad' : asset.digest }, 201);
    }
    throw new Error('Unexpected API request');
  }) as unknown as typeof fetch;
  return {
    fetchFn,
    events,
    get written() {
      return written;
    },
    get manifest() {
      return parsedManifest;
    },
  };
}

describe('private LockDown installer archive', () => {
  it('follows the two official download pages used by the institution link', async () => {
    const f = fixture({
      downloadHtml: '<p>Version: 2.1.6.02</p><a href="download7.php?id=123456789">Download</a>',
    });
    await archiveLockdown({ token: 'TEST_ONLY', version, fetchFn: f.fetchFn });
    expect(f.events).toEqual([
      'page',
      'download-page',
      'installer',
      'release',
      'upload',
      'manifest',
    ]);
  });
  it('uses only the observed matching vendor MSI URL', () => {
    expect(installerFromHtml(html, page, version)?.href).toBe(installer);
    expect(
      installerFromHtml(html.replace('downloads.respondus.com', 'example.com'), page, version),
    ).toBeNull();
    expect(
      installerFromHtml(html.replaceAll('123456789/', '999999999/'), page, version),
    ).toBeNull();
    expect(() => installerFromHtml(html, page, '2.1.6.03')).toThrow('has not reached');
    expect(installerFromHtml('<p>Version: 2.1.6.02</p>', page, version)).toBeNull();
  });

  it('confirms privacy before any vendor request', async () => {
    const f = fixture({ publicRepo: true });
    await expect(
      archiveLockdown({ token: 'TEST_ONLY', version, fetchFn: f.fetchFn }),
    ).rejects.toThrow('private Dawson Bot');
    expect(f.events).toEqual([]);
  });

  it('uploads and verifies before creating a small, create-only manifest', async () => {
    const f = fixture();
    const result = await archiveLockdown({
      token: 'TEST_ONLY',
      version,
      fetchFn: f.fetchFn,
      now: () => new Date('2026-10-21T18:00:00Z'),
    });
    expect(result.status).toBe('archived');
    expect(f.events).toEqual(['page', 'installer', 'release', 'upload', 'manifest']);
    expect(f.manifest).toMatchObject({
      version,
      sha256: hash,
      sizeBytes: payload.length,
      assetId: 12,
      installerUrl: installer,
    });
    expect(f.written?.branch).toBe('main');
    expect(f.written).not.toHaveProperty('sha');
    expect(f.written?.message).toContain('[skip ci]');
  });

  it('already archived versions only recheck their private asset metadata', async () => {
    const f = fixture({
      saved: {
        schemaVersion: 1,
        platform: 'windows',
        version,
        sha256: hash,
        sizeBytes: payload.length,
        releaseTag: tag,
        assetId: 12,
        assetName,
      },
    });
    expect(
      (await archiveLockdown({ token: 'TEST_ONLY', version, fetchFn: f.fetchFn })).status,
    ).toBe('already-archived');
    expect(f.events).toEqual([]);
  });

  it('does not claim a missing archived asset is healthy', async () => {
    const f = fixture({
      saved: {
        schemaVersion: 1,
        platform: 'windows',
        version,
        sha256: hash,
        sizeBytes: payload.length,
        releaseTag: tag,
        assetId: 12,
        assetName,
      },
      missingAsset: true,
    });
    await expect(
      archiveLockdown({ token: 'TEST_ONLY', version, fetchFn: f.fetchFn }),
    ).rejects.toThrow('incomplete');
    expect(f.events).toEqual([]);
  });

  it.each([
    { uploadFails: true },
    { badDigest: true },
    { length: payload.length + 1 },
    { bytes: Buffer.from('<html>not an installer</html>') },
  ])('never creates a successful manifest for an incomplete save: %j', async (options) => {
    const f = fixture(options);
    await expect(
      archiveLockdown({ token: 'TEST_ONLY', version, fetchFn: f.fetchFn }),
    ).rejects.toThrow();
    expect(f.events).not.toContain('manifest');
  });

  it('bounds download size and retains prior versions on failure', async () => {
    const f = fixture();
    await expect(
      archiveLockdown({ token: 'TEST_ONLY', version, fetchFn: f.fetchFn, maxInstallerBytes: 8 }),
    ).rejects.toThrow('size limit');
    expect(f.events).not.toContain('release');
  });

  it('resumes an upload completed before an interrupted manifest save', async () => {
    const f = fixture({ releasedAsset: true });
    expect(
      (await archiveLockdown({ token: 'TEST_ONLY', version, fetchFn: f.fetchFn })).status,
    ).toBe('archived');
    expect(f.events).toEqual(['page', 'installer', 'manifest']);
  });

  it('leaves a confirmed asset available for retry if main has a write conflict', async () => {
    const f = fixture({ manifestFails: true });
    await expect(
      archiveLockdown({ token: 'TEST_ONLY', version, fetchFn: f.fetchFn }),
    ).rejects.toThrow('409');
    expect(f.events).toEqual(['page', 'installer', 'release', 'upload', 'manifest']);
    expect(f.fetchFn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
