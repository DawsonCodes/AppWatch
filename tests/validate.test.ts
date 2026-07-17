import { describe, expect, it } from 'vitest';
import type { AppRecord } from '../src/shared/types.ts';
import {
  validateAppsFile,
  validateHistoryFile,
  validateStatusFile,
} from '../src/shared/validate.ts';

const validApp: AppRecord = {
  id: 'apple:100',
  platform: 'apple',
  storeId: '100',
  name: 'Example',
  developer: 'Example Corp',
  iconUrl: null,
  storeUrl: 'https://apps.apple.com/us/app/id100',
  currentVersion: '1.0.0',
  previousVersion: null,
  releaseDate: '2026-07-01T00:00:00.000Z',
  releaseNotes: null,
  category: null,
  bundleId: null,
  firstTrackedAt: '2026-07-14T00:00:00.000Z',
  lastCheckedAt: '2026-07-14T00:00:00.000Z',
  lastUpdatedAt: null,
  checkStatus: 'ok',
  checkError: null,
  updateDetected: false,
};

describe('validateAppsFile', () => {
  it('accepts a valid file including the empty initial state', () => {
    expect(validateAppsFile({ schemaVersion: 1, generatedAt: null, apps: [] })).toEqual([]);
    expect(
      validateAppsFile({
        schemaVersion: 1,
        generatedAt: '2026-07-14T00:00:00.000Z',
        apps: [validApp],
      }),
    ).toEqual([]);
  });

  it('rejects structural problems with specific messages', () => {
    expect(validateAppsFile(null)).not.toEqual([]);
    expect(validateAppsFile({ schemaVersion: 2, generatedAt: null, apps: [] })).toContainEqual(
      expect.stringContaining('schemaVersion'),
    );
    expect(
      validateAppsFile({ schemaVersion: 1, generatedAt: null, apps: [{ ...validApp, name: '' }] }),
    ).toContainEqual(expect.stringContaining('name'));
    expect(
      validateAppsFile({
        schemaVersion: 1,
        generatedAt: null,
        apps: [{ ...validApp, platform: 'windows' }],
      }),
    ).toContainEqual(expect.stringContaining('platform'));
    expect(
      validateAppsFile({
        schemaVersion: 1,
        generatedAt: null,
        apps: [{ ...validApp, id: 'mismatched' }],
      }),
    ).toContainEqual(expect.stringContaining('id'));
  });

  it('rejects duplicate app ids', () => {
    expect(
      validateAppsFile({ schemaVersion: 1, generatedAt: null, apps: [validApp, validApp] }),
    ).toContainEqual(expect.stringContaining('duplicate'));
  });

  it('accepts records without the extended metadata fields (pre-1.1 data)', () => {
    // validApp deliberately has no price/rating/etc — exactly like data
    // generated before the fields existed.
    expect(validateAppsFile({ schemaVersion: 1, generatedAt: null, apps: [validApp] })).toEqual([]);
  });

  it('accepts well-typed extended metadata and rejects bad values', () => {
    const extended = {
      ...validApp,
      price: 'Free',
      contentRating: '4+',
      requiresOs: 'iOS 15.0 or later',
      sizeBytes: 123456,
      rating: 4.5,
      ratingCount: 1000,
      developerWebsite: 'https://example.com',
    };
    expect(validateAppsFile({ schemaVersion: 1, generatedAt: null, apps: [extended] })).toEqual([]);
    expect(
      validateAppsFile({
        schemaVersion: 1,
        generatedAt: null,
        apps: [{ ...validApp, rating: 9 }],
      }),
    ).toContainEqual(expect.stringContaining('rating'));
    expect(
      validateAppsFile({
        schemaVersion: 1,
        generatedAt: null,
        apps: [{ ...validApp, sizeBytes: 'big' }],
      }),
    ).toContainEqual(expect.stringContaining('sizeBytes'));
    expect(
      validateAppsFile({
        schemaVersion: 1,
        generatedAt: null,
        apps: [{ ...validApp, price: 42 }],
      }),
    ).toContainEqual(expect.stringContaining('price'));
  });
});

describe('validateHistoryFile', () => {
  const entry = {
    version: '1.0.0',
    releaseDate: null,
    releaseNotes: 'Notes',
    detectedAt: '2026-07-14T00:00:00.000Z',
  };

  it('accepts valid history including the empty initial state', () => {
    expect(validateHistoryFile({ schemaVersion: 1, entries: {} })).toEqual([]);
    expect(validateHistoryFile({ schemaVersion: 1, entries: { 'apple:100': [entry] } })).toEqual(
      [],
    );
  });

  it('rejects duplicate versions within one app history', () => {
    expect(
      validateHistoryFile({ schemaVersion: 1, entries: { 'apple:100': [entry, entry] } }),
    ).toContainEqual(expect.stringContaining('duplicate version'));
  });

  it('rejects entries with missing fields', () => {
    expect(
      validateHistoryFile({ schemaVersion: 1, entries: { 'apple:100': [{ version: '1' }] } }),
    ).toContainEqual(expect.stringContaining('detectedAt'));
  });
});

describe('validateStatusFile', () => {
  it('accepts valid status files', () => {
    expect(
      validateStatusFile({
        schemaVersion: 1,
        lastRunAt: null,
        lastSuccessAt: null,
        totalApps: 0,
        okCount: 0,
        errorCount: 0,
        updatesDetected: 0,
      }),
    ).toEqual([]);
  });

  it('rejects negative or non-integer counters', () => {
    expect(
      validateStatusFile({
        schemaVersion: 1,
        lastRunAt: null,
        lastSuccessAt: null,
        totalApps: -1,
        okCount: 0,
        errorCount: 0,
        updatesDetected: 0,
      }),
    ).toContainEqual(expect.stringContaining('totalApps'));
  });
});
