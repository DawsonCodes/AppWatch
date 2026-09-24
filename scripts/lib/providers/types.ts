import type { Platform } from '../../../src/shared/types.ts';
import type { TrackTarget } from '../config.ts';

/** Normalized result of one store lookup, before merging with stored data. */
export interface AppSnapshot {
  platform: Platform;
  storeId: string;
  name: string;
  developer: string | null;
  iconUrl: string | null;
  storeUrl: string;
  version: string | null;
  releaseDate: string | null;
  /** Plain text. Providers must strip any markup before returning notes. */
  releaseNotes: string | null;
  category: string | null;
  bundleId: string | null;
  price: string | null;
  contentRating: string | null;
  requiresOs: string | null;
  sizeBytes: number | null;
  rating: number | null;
  ratingCount: number | null;
  developerWebsite: string | null;
}

/** A store integration: fetches and normalizes metadata for one target. */
export interface ProviderFetch {
  (target: TrackTarget): Promise<AppSnapshot>;
  /**
   * Optional bulk warm-up called once per run with every target for this
   * store, before the per-app calls (e.g. one batched lookup for many apps).
   * Failures here are non-fatal: per-app calls fall back to single requests.
   */
  prime?: (targets: readonly TrackTarget[]) => Promise<void>;
}

export class ProviderError extends Error {}

export function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function asIsoDate(value: unknown): string | null {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  return null;
}
