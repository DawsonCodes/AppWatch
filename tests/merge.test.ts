import { describe, expect, it } from 'vitest';
import {
  appendHistory,
  hasMeaningfulChange,
  mergeFailure,
  mergeSnapshot,
} from '../scripts/lib/merge.ts';
import type { AppSnapshot } from '../scripts/lib/providers/types.ts';
import type { AppRecord, AppsFile, HistoryFile } from '../src/shared/types.ts';

const NOW = '2026-07-14T12:00:00.000Z';
const LATER = '2026-07-15T12:00:00.000Z';

const snapshot: AppSnapshot = {
  platform: 'apple',
  storeId: '100',
  name: 'Example',
  developer: 'Example Corp',
  iconUrl: 'https://is1-ssl.mzstatic.com/icon.png',
  storeUrl: 'https://apps.apple.com/us/app/id100',
  version: '1.0.0',
  releaseDate: '2026-07-01T00:00:00.000Z',
  releaseNotes: 'Initial release',
  category: 'Utilities',
  bundleId: 'com.example.app',
  price: 'Free',
  contentRating: '4+',
  requiresOs: 'iOS 15.0 or later',
  sizeBytes: 120_000_000,
  rating: 4.62,
  ratingCount: 12_345,
  developerWebsite: 'https://example.com',
};

describe('mergeSnapshot — first check', () => {
  it('creates a record whose history starts from the first real snapshot', () => {
    const { record, history, outcome } = mergeSnapshot(undefined, [], snapshot, NOW);
    expect(outcome).toBe('new');
    expect(record.id).toBe('apple:100');
    expect(record.currentVersion).toBe('1.0.0');
    expect(record.previousVersion).toBeNull();
    expect(record.firstTrackedAt).toBe(NOW);
    expect(record.lastUpdatedAt).toBeNull();
    expect(record.updateDetected).toBe(false);
    expect(record.checkStatus).toBe('ok');
    expect(history).toEqual([
      {
        version: '1.0.0',
        releaseDate: snapshot.releaseDate,
        releaseNotes: 'Initial release',
        detectedAt: NOW,
      },
    ]);
  });

  it('starts with empty history when the store reports no version', () => {
    const { record, history } = mergeSnapshot(undefined, [], { ...snapshot, version: null }, NOW);
    expect(record.currentVersion).toBeNull();
    expect(history).toEqual([]);
  });
});

describe('mergeSnapshot — updates', () => {
  const base = mergeSnapshot(undefined, [], snapshot, NOW);

  it('detects a version change, preserving the previous version and history', () => {
    const next: AppSnapshot = {
      ...snapshot,
      version: '2.0.0',
      releaseDate: '2026-07-14T00:00:00.000Z',
      releaseNotes: 'Big redesign',
    };
    const { record, history, outcome } = mergeSnapshot(base.record, base.history, next, LATER);
    expect(outcome).toBe('updated');
    expect(record.currentVersion).toBe('2.0.0');
    expect(record.previousVersion).toBe('1.0.0');
    expect(record.lastUpdatedAt).toBe(LATER);
    expect(record.updateDetected).toBe(true);
    expect(record.firstTrackedAt).toBe(NOW);
    expect(history.map((h) => h.version)).toEqual(['2.0.0', '1.0.0']);
    expect(history[0]?.releaseNotes).toBe('Big redesign');
  });

  it('reports unchanged when the version is identical, refreshing metadata only', () => {
    const { record, history, outcome } = mergeSnapshot(
      base.record,
      base.history,
      { ...snapshot, releaseNotes: 'Initial release (edited)' },
      LATER,
    );
    expect(outcome).toBe('unchanged');
    expect(record.currentVersion).toBe('1.0.0');
    expect(record.previousVersion).toBeNull();
    expect(record.updateDetected).toBe(false);
    expect(record.lastCheckedAt).toBe(LATER);
    expect(record.releaseNotes).toBe('Initial release (edited)');
    expect(history).toHaveLength(1);
  });

  it('does not duplicate history when a known version reappears', () => {
    const v2 = mergeSnapshot(base.record, base.history, { ...snapshot, version: '2.0.0' }, LATER);
    const rollback = mergeSnapshot(
      v2.record,
      v2.history,
      { ...snapshot, version: '1.0.0' },
      '2026-07-16T00:00:00.000Z',
    );
    expect(rollback.outcome).toBe('updated');
    expect(rollback.record.currentVersion).toBe('1.0.0');
    expect(rollback.history.map((h) => h.version)).toEqual(['2.0.0', '1.0.0']);
  });

  it('keeps existing values when the store stops providing optional fields', () => {
    const { record } = mergeSnapshot(
      base.record,
      base.history,
      { ...snapshot, developer: null, iconUrl: null, category: null, price: null, rating: null },
      LATER,
    );
    expect(record.developer).toBe('Example Corp');
    expect(record.iconUrl).toBe('https://is1-ssl.mzstatic.com/icon.png');
    expect(record.category).toBe('Utilities');
    expect(record.price).toBe('Free');
    expect(record.rating).toBe(4.62);
  });

  it('stores the extended metadata fields on new and merged records', () => {
    expect(base.record.contentRating).toBe('4+');
    expect(base.record.requiresOs).toBe('iOS 15.0 or later');
    expect(base.record.sizeBytes).toBe(120_000_000);
    expect(base.record.ratingCount).toBe(12_345);
    expect(base.record.developerWebsite).toBe('https://example.com');
    const merged = mergeSnapshot(base.record, base.history, { ...snapshot, rating: 4.7 }, LATER);
    expect(merged.record.rating).toBe(4.7);
  });
});

describe('appendHistory', () => {
  it('prepends new versions and rejects duplicates', () => {
    const entry = { version: '1.0', releaseDate: null, releaseNotes: null, detectedAt: NOW };
    const one = appendHistory([], entry);
    expect(one).toHaveLength(1);
    expect(appendHistory(one, { ...entry, detectedAt: LATER })).toBe(one);
    const two = appendHistory(one, { ...entry, version: '1.1' });
    expect(two.map((h) => h.version)).toEqual(['1.1', '1.0']);
  });
});

describe('mergeFailure', () => {
  const base = mergeSnapshot(undefined, [], snapshot, NOW);

  it('keeps all previously stored data when a check fails', () => {
    const { record, history, outcome } = mergeFailure(
      base.record,
      base.history,
      'apple',
      '100',
      'https://apps.apple.com/us/app/id100',
      'HTTP 503 from itunes.apple.com',
      LATER,
    );
    expect(outcome).toBe('failed');
    expect(record.currentVersion).toBe('1.0.0');
    expect(record.name).toBe('Example');
    expect(record.checkStatus).toBe('error');
    expect(record.checkError).toContain('503');
    expect(record.lastCheckedAt).toBe(NOW); // last *successful* check is preserved
    expect(history).toEqual(base.history);
  });

  it('creates a visible stub for apps that have never been fetched', () => {
    const { record } = mergeFailure(
      undefined,
      [],
      'google',
      'com.example',
      'https://play.google.com/store/apps/details?id=com.example',
      'timeout',
      NOW,
    );
    expect(record.name).toBe('com.example');
    expect(record.checkStatus).toBe('error');
    expect(record.currentVersion).toBeNull();
  });

  it('truncates very long error messages', () => {
    const { record } = mergeFailure(
      undefined,
      [],
      'apple',
      '1',
      'https://example.invalid',
      'x'.repeat(1000),
      NOW,
    );
    expect(record.checkError?.length).toBeLessThanOrEqual(301);
  });
});

describe('hasMeaningfulChange', () => {
  function filesFor(
    record: AppRecord,
    historyEntries: HistoryFile['entries'],
  ): [AppsFile, HistoryFile] {
    return [
      { schemaVersion: 1, generatedAt: NOW, apps: [record] },
      { schemaVersion: 1, entries: historyEntries },
    ];
  }

  const base = mergeSnapshot(undefined, [], snapshot, NOW);
  const [appsA, historyA] = filesFor(base.record, { 'apple:100': base.history });

  it('treats the very first run as a change', () => {
    expect(hasMeaningfulChange(null, appsA, null, historyA)).toBe(true);
  });

  it('ignores timestamp-only churn', () => {
    const unchanged = mergeSnapshot(base.record, base.history, snapshot, LATER);
    const [appsB, historyB] = filesFor(unchanged.record, { 'apple:100': unchanged.history });
    expect(hasMeaningfulChange(appsA, appsB, historyA, historyB)).toBe(false);
  });

  it('flags real changes such as a new version', () => {
    const updated = mergeSnapshot(
      base.record,
      base.history,
      { ...snapshot, version: '2.0.0' },
      LATER,
    );
    const [appsB, historyB] = filesFor(updated.record, { 'apple:100': updated.history });
    expect(hasMeaningfulChange(appsA, appsB, historyA, historyB)).toBe(true);
  });

  it('flags a check-status transition so failures become visible', () => {
    const failed = mergeFailure(base.record, base.history, 'apple', '100', 'url', 'boom', LATER);
    const [appsB, historyB] = filesFor(failed.record, { 'apple:100': failed.history });
    expect(hasMeaningfulChange(appsA, appsB, historyA, historyB)).toBe(true);
  });

  it('treats live rating drift as volatile, not worth a commit on its own', () => {
    const drifted = mergeSnapshot(
      base.record,
      base.history,
      { ...snapshot, rating: 4.63, ratingCount: 12_399 },
      LATER,
    );
    const [appsB, historyB] = filesFor(drifted.record, { 'apple:100': drifted.history });
    expect(hasMeaningfulChange(appsA, appsB, historyA, historyB)).toBe(false);
  });

  it('still flags non-volatile metadata changes such as price', () => {
    const repriced = mergeSnapshot(
      base.record,
      base.history,
      { ...snapshot, price: '$1.99' },
      LATER,
    );
    const [appsB, historyB] = filesFor(repriced.record, { 'apple:100': repriced.history });
    expect(hasMeaningfulChange(appsA, appsB, historyA, historyB)).toBe(true);
  });
});
