/**
 * Hand-rolled structural validation for the generated JSON files. Used by the
 * checker before writing, by CI before deploying, and by the frontend before
 * trusting fetched data. Kept dependency-free so the browser bundle stays small.
 */

import type { AppsFile, HistoryFile, StatusFile } from './types.ts';

type Path = string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && value.length >= 10 && !Number.isNaN(Date.parse(value));
}

function checkString(errors: string[], value: unknown, path: Path): void {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${path}: expected non-empty string`);
  }
}

function checkNullableString(errors: string[], value: unknown, path: Path): void {
  if (value !== null && typeof value !== 'string') {
    errors.push(`${path}: expected string or null`);
  }
}

function checkNullableIso(errors: string[], value: unknown, path: Path): void {
  if (value !== null && !isIsoDate(value)) {
    errors.push(`${path}: expected ISO 8601 date string or null`);
  }
}

function checkHistoryEntry(errors: string[], value: unknown, path: Path): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`);
    return;
  }
  checkString(errors, value.version, `${path}.version`);
  checkNullableIso(errors, value.releaseDate, `${path}.releaseDate`);
  checkNullableString(errors, value.releaseNotes, `${path}.releaseNotes`);
  if (!isIsoDate(value.detectedAt)) {
    errors.push(`${path}.detectedAt: expected ISO 8601 date string`);
  }
}

function checkAppRecord(errors: string[], value: unknown, path: Path): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`);
    return;
  }
  checkString(errors, value.id, `${path}.id`);
  if (value.platform !== 'apple' && value.platform !== 'google') {
    errors.push(`${path}.platform: expected "apple" or "google"`);
  }
  checkString(errors, value.storeId, `${path}.storeId`);
  if (
    typeof value.id === 'string' &&
    typeof value.storeId === 'string' &&
    typeof value.platform === 'string' &&
    value.id !== `${value.platform}:${value.storeId}`
  ) {
    errors.push(`${path}.id: expected "${value.platform}:${value.storeId}"`);
  }
  checkString(errors, value.name, `${path}.name`);
  checkNullableString(errors, value.developer, `${path}.developer`);
  checkNullableString(errors, value.iconUrl, `${path}.iconUrl`);
  checkString(errors, value.storeUrl, `${path}.storeUrl`);
  checkNullableString(errors, value.currentVersion, `${path}.currentVersion`);
  checkNullableString(errors, value.previousVersion, `${path}.previousVersion`);
  checkNullableIso(errors, value.releaseDate, `${path}.releaseDate`);
  checkNullableString(errors, value.releaseNotes, `${path}.releaseNotes`);
  checkNullableString(errors, value.category, `${path}.category`);
  checkNullableString(errors, value.bundleId, `${path}.bundleId`);
  if (!isIsoDate(value.firstTrackedAt)) {
    errors.push(`${path}.firstTrackedAt: expected ISO 8601 date string`);
  }
  checkNullableIso(errors, value.lastCheckedAt, `${path}.lastCheckedAt`);
  checkNullableIso(errors, value.lastUpdatedAt, `${path}.lastUpdatedAt`);
  if (
    value.checkStatus !== 'ok' &&
    value.checkStatus !== 'error' &&
    value.checkStatus !== 'pending'
  ) {
    errors.push(`${path}.checkStatus: expected "ok", "error" or "pending"`);
  }
  checkNullableString(errors, value.checkError, `${path}.checkError`);
  if (typeof value.updateDetected !== 'boolean') {
    errors.push(`${path}.updateDetected: expected boolean`);
  }
}

export function validateAppsFile(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['apps file: expected object'];
  if (value.schemaVersion !== 1) errors.push('schemaVersion: expected 1');
  checkNullableIso(errors, value.generatedAt, 'generatedAt');
  if (!Array.isArray(value.apps)) {
    errors.push('apps: expected array');
    return errors;
  }
  const seen = new Set<string>();
  value.apps.forEach((app, i) => {
    checkAppRecord(errors, app, `apps[${i}]`);
    if (isRecord(app) && typeof app.id === 'string') {
      if (seen.has(app.id)) errors.push(`apps[${i}].id: duplicate id "${app.id}"`);
      seen.add(app.id);
    }
  });
  return errors;
}

export function validateHistoryFile(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['history file: expected object'];
  if (value.schemaVersion !== 1) errors.push('schemaVersion: expected 1');
  if (!isRecord(value.entries)) {
    errors.push('entries: expected object');
    return errors;
  }
  for (const [id, list] of Object.entries(value.entries)) {
    if (!Array.isArray(list)) {
      errors.push(`entries["${id}"]: expected array`);
      continue;
    }
    const versions = new Set<string>();
    list.forEach((entry, i) => {
      checkHistoryEntry(errors, entry, `entries["${id}"][${i}]`);
      if (isRecord(entry) && typeof entry.version === 'string') {
        if (versions.has(entry.version)) {
          errors.push(`entries["${id}"][${i}]: duplicate version "${entry.version}"`);
        }
        versions.add(entry.version);
      }
    });
  }
  return errors;
}

export function validateStatusFile(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['status file: expected object'];
  if (value.schemaVersion !== 1) errors.push('schemaVersion: expected 1');
  checkNullableIso(errors, value.lastRunAt, 'lastRunAt');
  checkNullableIso(errors, value.lastSuccessAt, 'lastSuccessAt');
  for (const key of ['totalApps', 'okCount', 'errorCount', 'updatesDetected'] as const) {
    const n = value[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
      errors.push(`${key}: expected non-negative integer`);
    }
  }
  return errors;
}

export function isValidAppsFile(value: unknown): value is AppsFile {
  return validateAppsFile(value).length === 0;
}

export function isValidHistoryFile(value: unknown): value is HistoryFile {
  return validateHistoryFile(value).length === 0;
}

export function isValidStatusFile(value: unknown): value is StatusFile {
  return validateStatusFile(value).length === 0;
}
