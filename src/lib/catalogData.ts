/**
 * The tracked-app catalog (collections, names, and which store listings
 * belong to the same app), bundled at build time from apps.config.json so
 * the site groups apps exactly the way the checker tracks them.
 */

import rawConfig from '../../apps.config.json';
import type { Catalog } from '../shared/catalog.ts';
import { parseCatalog } from '../shared/catalog.ts';

function load(): Catalog {
  try {
    return parseCatalog(rawConfig);
  } catch {
    // CI validates the config, so this only guards against a broken local
    // edit: every tracked listing still shows, grouped under "Other".
    return { collections: [], apps: [] };
  }
}

export const CATALOG: Catalog = load();
