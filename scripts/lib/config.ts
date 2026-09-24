/**
 * Turns apps.config.json — the human-edited list of tracked apps — into the
 * flat list of store listings the checker queries. The file format itself
 * (collections of named apps, plus the legacy flat "apps" array) is parsed
 * by the shared catalog module so the website groups apps the same way.
 */

import type { Platform } from '../../src/shared/types.ts';
import { CatalogError, catalogListings, parseCatalog } from '../../src/shared/catalog.ts';

export interface TrackTarget {
  platform: Platform;
  storeId: string;
  /** Two-letter storefront/country code, e.g. "us". */
  country: string;
  /** Language code used for Google Play metadata, e.g. "en". */
  language: string;
}

export interface CheckerConfig {
  targets: TrackTarget[];
}

/** Configuration problems carry actionable messages for whoever edits the file. */
export { CatalogError as ConfigError };

export function parseConfig(raw: unknown): CheckerConfig {
  const catalog = parseCatalog(raw);
  return {
    targets: catalogListings(catalog).map(({ platform, storeId, country, language }) => ({
      platform,
      storeId,
      country,
      language,
    })),
  };
}
