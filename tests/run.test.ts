import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckerConfig } from '../scripts/lib/config.ts';
import { runCheck } from '../scripts/lib/run.ts';
import type { AppSnapshot, ProviderFetch } from '../scripts/lib/providers/types.ts';
import type { AppsFile, HistoryFile, StatusFile } from '../src/shared/types.ts';
import {
  validateAppsFile,
  validateHistoryFile,
  validateStatusFile,
} from '../src/shared/validate.ts';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'appwatch-test-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const config: CheckerConfig = {
  targets: [
    { platform: 'apple', storeId: '100', country: 'us', language: 'en' },
    { platform: 'google', storeId: 'com.example', country: 'us', language: 'en' },
  ],
};

function snapshotFor(platform: 'apple' | 'google', version: string): AppSnapshot {
  const storeId = platform === 'apple' ? '100' : 'com.example';
  return {
    platform,
    storeId,
    name: platform === 'apple' ? 'Apple App' : 'Android App',
    developer: 'Dev',
    iconUrl: null,
    storeUrl: `https://example.com/${storeId}`,
    version,
    releaseDate: '2026-07-01T00:00:00.000Z',
    releaseNotes: `Notes for ${version}`,
    category: null,
    bundleId: null,
    price: null,
    contentRating: null,
    requiresOs: null,
    sizeBytes: null,
    rating: null,
    ratingCount: null,
    developerWebsite: null,
  };
}

function providerReturning(version: string): ProviderFetch {
  return async (target) => snapshotFor(target.platform, version);
}

function failingProvider(message: string): ProviderFetch {
  return async () => {
    throw new Error(message);
  };
}

function readData(): { apps: AppsFile; history: HistoryFile; status: StatusFile } {
  return {
    apps: JSON.parse(readFileSync(join(dataDir, 'apps.json'), 'utf8')) as AppsFile,
    history: JSON.parse(readFileSync(join(dataDir, 'history.json'), 'utf8')) as HistoryFile,
    status: JSON.parse(readFileSync(join(dataDir, 'status.json'), 'utf8')) as StatusFile,
  };
}

describe('runCheck', () => {
  it('writes valid data files on the first run', async () => {
    const result = await runCheck({
      config,
      providers: { apple: providerReturning('1.0'), google: providerReturning('5.0') },
      dataDir,
      delayMs: 0,
      now: () => new Date('2026-07-14T00:00:00.000Z'),
    });

    expect(result.changed).toBe(true);
    expect(result.okCount).toBe(2);
    const { apps, history, status } = readData();
    expect(validateAppsFile(apps)).toEqual([]);
    expect(validateHistoryFile(history)).toEqual([]);
    expect(validateStatusFile(status)).toEqual([]);
    expect(apps.apps).toHaveLength(2);
    expect(history.entries['apple:100']).toHaveLength(1);
    expect(status.totalApps).toBe(2);
    expect(status.updatesDetected).toBe(0);
  });

  it('does not rewrite files when nothing meaningful changed', async () => {
    const providers = { apple: providerReturning('1.0'), google: providerReturning('5.0') };
    await runCheck({ config, providers, dataDir, delayMs: 0 });
    const before = statSync(join(dataDir, 'apps.json')).mtimeMs;

    const second = await runCheck({ config, providers, dataDir, delayMs: 0 });
    expect(second.changed).toBe(false);
    expect(statSync(join(dataDir, 'apps.json')).mtimeMs).toBe(before);
  });

  it('detects updates on later runs and appends history', async () => {
    await runCheck({
      config,
      providers: { apple: providerReturning('1.0'), google: providerReturning('5.0') },
      dataDir,
      delayMs: 0,
    });
    const result = await runCheck({
      config,
      providers: { apple: providerReturning('1.1'), google: providerReturning('5.0') },
      dataDir,
      delayMs: 0,
    });

    expect(result.changed).toBe(true);
    expect(result.updatesDetected).toBe(1);
    const { apps, history, status } = readData();
    const apple = apps.apps.find((a) => a.id === 'apple:100');
    expect(apple?.currentVersion).toBe('1.1');
    expect(apple?.previousVersion).toBe('1.0');
    expect(apple?.updateDetected).toBe(true);
    expect(history.entries['apple:100']?.map((h) => h.version)).toEqual(['1.1', '1.0']);
    expect(status.updatesDetected).toBe(1);
  });

  it('continues past one failing app and keeps its stored data', async () => {
    await runCheck({
      config,
      providers: { apple: providerReturning('1.0'), google: providerReturning('5.0') },
      dataDir,
      delayMs: 0,
    });
    const result = await runCheck({
      config,
      providers: { apple: failingProvider('HTTP 500'), google: providerReturning('5.1') },
      dataDir,
      delayMs: 0,
    });

    expect(result.okCount).toBe(1);
    expect(result.errorCount).toBe(1);
    const { apps, status } = readData();
    const apple = apps.apps.find((a) => a.id === 'apple:100');
    expect(apple?.checkStatus).toBe('error');
    expect(apple?.currentVersion).toBe('1.0'); // stale data preserved
    const google = apps.apps.find((a) => a.id === 'google:com.example');
    expect(google?.currentVersion).toBe('5.1');
    expect(status.errorCount).toBe(1);
  });

  it('handles a run where every provider fails without writing garbage', async () => {
    const result = await runCheck({
      config,
      providers: { apple: failingProvider('down'), google: failingProvider('down') },
      dataDir,
      delayMs: 0,
    });
    expect(result.okCount).toBe(0);
    expect(result.changed).toBe(true); // stubs recorded so failures are visible
    const { apps } = readData();
    expect(validateAppsFile(apps)).toEqual([]);
    expect(apps.apps.every((a) => a.checkStatus === 'error')).toBe(true);
  });

  it('drops apps that were removed from the configuration', async () => {
    await runCheck({
      config,
      providers: { apple: providerReturning('1.0'), google: providerReturning('5.0') },
      dataDir,
      delayMs: 0,
    });
    const smaller: CheckerConfig = { targets: [config.targets[0]!] };
    const result = await runCheck({
      config: smaller,
      providers: { apple: providerReturning('1.0'), google: providerReturning('5.0') },
      dataDir,
      delayMs: 0,
    });
    expect(result.changed).toBe(true);
    const { apps, history } = readData();
    expect(apps.apps.map((a) => a.id)).toEqual(['apple:100']);
    expect(history.entries['google:com.example']).toBeUndefined();
  });

  it('starts cleanly when no data files exist yet', async () => {
    expect(existsSync(join(dataDir, 'apps.json'))).toBe(false);
    const result = await runCheck({
      config: { targets: [config.targets[0]!] },
      providers: { apple: providerReturning('1.0'), google: failingProvider('unused') },
      dataDir,
      delayMs: 0,
    });
    expect(result.changed).toBe(true);
    expect(readData().apps.apps).toHaveLength(1);
  });
});
