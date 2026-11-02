/**
 * Hand-rolled structural validation for the generated JSON files. Used by the
 * checker before writing, by CI before deploying, and by the frontend before
 * trusting fetched data. Kept dependency-free so the browser bundle stays small.
 */

import type { AppsFile, HistoryFile, StatusFile } from './types.ts';
import { historyEntryKey, isPlatform, PLATFORMS } from './types.ts';

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

/** Optional extended-metadata fields: absent is fine, present must be typed. */
function checkOptionalNullableString(
  errors: string[],
  record: Record<string, unknown>,
  key: string,
  path: Path,
): void {
  if (!(key in record) || record[key] === undefined) return;
  checkNullableString(errors, record[key], `${path}.${key}`);
}

function checkOptionalNullableNumber(
  errors: string[],
  record: Record<string, unknown>,
  key: string,
  path: Path,
  max = Number.POSITIVE_INFINITY,
): void {
  if (!(key in record) || record[key] === undefined) return;
  const value = record[key];
  if (value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    errors.push(`${path}.${key}: expected number in range or null`);
  }
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Optional link field: absent, null, or an https URL. */
function checkOptionalUrl(
  errors: string[],
  record: Record<string, unknown>,
  key: string,
  path: Path,
): void {
  if (!(key in record) || record[key] === null) return;
  if (!isHttpsUrl(record[key])) errors.push(`${path}.${key}: expected https URL or null`);
}

function checkHistoryEntry(errors: string[], value: unknown, path: Path): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`);
    return;
  }
  if (value.version === null) {
    // Version-less releases are identified by their release date.
    if (!isIsoDate(value.releaseDate)) {
      errors.push(`${path}.releaseDate: required when version is null`);
    }
  } else {
    checkString(errors, value.version, `${path}.version`);
  }
  checkNullableIso(errors, value.releaseDate, `${path}.releaseDate`);
  checkNullableString(errors, value.releaseNotes, `${path}.releaseNotes`);
  if (!isIsoDate(value.detectedAt)) {
    errors.push(`${path}.detectedAt: expected ISO 8601 date string`);
  }
  checkOptionalUrl(errors, value, 'url', path);
}

function checkAppRecord(errors: string[], value: unknown, path: Path): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`);
    return;
  }
  checkString(errors, value.id, `${path}.id`);
  if (!isPlatform(value.platform)) {
    errors.push(`${path}.platform: expected one of ${PLATFORMS.map((p) => `"${p}"`).join(', ')}`);
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
  checkOptionalNullableString(errors, value, 'price', path);
  checkOptionalNullableString(errors, value, 'contentRating', path);
  checkOptionalNullableString(errors, value, 'requiresOs', path);
  checkOptionalNullableString(errors, value, 'developerWebsite', path);
  checkOptionalUrl(errors, value, 'releaseUrl', path);
  checkOptionalNullableNumber(errors, value, 'sizeBytes', path);
  checkOptionalNullableNumber(errors, value, 'rating', path, 5);
  checkOptionalNullableNumber(errors, value, 'ratingCount', path);
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
    const keys = new Set<string>();
    list.forEach((entry, i) => {
      checkHistoryEntry(errors, entry, `entries["${id}"][${i}]`);
      if (!isRecord(entry)) return;
      const key = historyEntryKey({
        version: typeof entry.version === 'string' ? entry.version : null,
        releaseDate: typeof entry.releaseDate === 'string' ? entry.releaseDate : null,
      });
      if (key === null) return;
      if (keys.has(key)) {
        errors.push(
          `entries["${id}"][${i}]: duplicate ${entry.version ? `version "${key}"` : `release ${key}`}`,
        );
      }
      keys.add(key);
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

function isFiniteNumber(value: unknown, min = 0, max = Number.POSITIVE_INFINITY): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function checkParams(errors: string[], value: unknown, path: Path): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`);
    return;
  }
  if (!isFiniteNumber(value.halfLife, 0.5, 1000)) errors.push(`${path}.halfLife: out of range`);
  if (!isFiniteNumber(value.bandwidth, 0.01, 5)) errors.push(`${path}.bandwidth: out of range`);
  if (!isFiniteNumber(value.weekday, 0, 5)) errors.push(`${path}.weekday: out of range`);
}

function checkLive(errors: string[], value: unknown, path: Path): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`);
    return;
  }
  const { forecasts, hits } = value;
  if (!Number.isInteger(forecasts) || (forecasts as number) < 0) {
    errors.push(`${path}.forecasts: expected non-negative integer`);
  }
  if (!Number.isInteger(hits) || (hits as number) < 0 || (hits as number) > (forecasts as number)) {
    errors.push(`${path}.hits: expected integer between 0 and forecasts`);
  }
  if (!isFiniteNumber(value.medianErrorDays)) errors.push(`${path}.medianErrorDays: out of range`);
}

export function validateForecastModelFile(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['forecast model: expected object'];
  if (value.schemaVersion !== 1) errors.push('schemaVersion: expected 1');
  if (!isIsoDate(value.trainedAt)) errors.push('trainedAt: expected ISO 8601 date string');
  if (!isFiniteNumber(value.target, 0.05, 0.99)) errors.push('target: out of range');
  checkParams(errors, value.params, 'params');
  if (
    !Array.isArray(value.masses) ||
    value.masses.length === 0 ||
    !value.masses.every((m) => isFiniteNumber(m, 0.05, 0.999))
  ) {
    errors.push('masses: expected non-empty array of shares');
  }
  if (!isRecord(value.listings)) {
    errors.push('listings: expected object');
  } else {
    for (const [id, entry] of Object.entries(value.listings)) {
      if (!isRecord(entry)) {
        errors.push(`listings["${id}"]: expected object`);
        continue;
      }
      if (entry.params !== undefined) checkParams(errors, entry.params, `listings["${id}"].params`);
      if (entry.live !== undefined) checkLive(errors, entry.live, `listings["${id}"].live`);
    }
  }
  if (!isRecord(value.replay)) {
    errors.push('replay: expected object');
  } else {
    checkLive(
      errors,
      {
        forecasts: value.replay.tests,
        hits: value.replay.hits,
        medianErrorDays: value.replay.medianErrorDays,
      },
      'replay',
    );
  }
  if (value.live !== null) checkLive(errors, value.live, 'live');
  return errors;
}

function checkRecordedForecast(
  errors: string[],
  value: unknown,
  path: Path,
  scored: boolean,
): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`);
    return;
  }
  for (const key of ['madeAt', 'after', 'from', 'to', 'point'] as const) {
    if (!isIsoDate(value[key])) errors.push(`${path}.${key}: expected ISO 8601 date string`);
  }
  if (!scored) return;
  if (!isIsoDate(value.actual)) errors.push(`${path}.actual: expected ISO 8601 date string`);
  if (typeof value.hit !== 'boolean') errors.push(`${path}.hit: expected boolean`);
  if (!isFiniteNumber(value.errorDays)) errors.push(`${path}.errorDays: out of range`);
}

export function validateForecastLogFile(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['forecast log: expected object'];
  if (value.schemaVersion !== 1) errors.push('schemaVersion: expected 1');
  if (!isRecord(value.listings)) {
    errors.push('listings: expected object');
    return errors;
  }
  for (const [id, entry] of Object.entries(value.listings)) {
    const path = `listings["${id}"]`;
    if (!isRecord(entry)) {
      errors.push(`${path}: expected object`);
      continue;
    }
    if (entry.open !== null) checkRecordedForecast(errors, entry.open, `${path}.open`, false);
    if (!Array.isArray(entry.scored)) {
      errors.push(`${path}.scored: expected array`);
      continue;
    }
    entry.scored.forEach((item, i) =>
      checkRecordedForecast(errors, item, `${path}.scored[${i}]`, true),
    );
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
