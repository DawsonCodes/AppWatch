/**
 * Minecraft: Java Edition versions (Windows and Mac), from Mojang's own
 * version list: the public JSON file the official launcher reads to offer
 * every release and snapshot, each with its release time. Only full
 * releases are tracked (snapshots and pre-releases are test builds).
 *
 * Per run: one request, shared by the Windows and Mac listings.
 */

import { feedFor } from '../../../src/shared/feeds.ts';
import type { TrackTarget } from '../config.ts';
import { fetchJson, withRetry } from '../net.ts';
import type { AppSnapshot, OfficialRelease, ProviderFetch } from './types.ts';
import { asIsoDate, asNonEmptyString, ProviderError } from './types.ts';

export const MINECRAFT_FEED_ID = 'minecraft-java';
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

/** Full releases from the version list, newest first. */
export function minecraftReleases(manifest: unknown): OfficialRelease[] {
  if (typeof manifest !== 'object' || manifest === null) return [];
  const versions = (manifest as Record<string, unknown>).versions;
  if (!Array.isArray(versions)) return [];
  const releases: OfficialRelease[] = [];
  for (const value of versions) {
    if (typeof value !== 'object' || value === null) continue;
    const raw = value as Record<string, unknown>;
    if (raw.type !== 'release') continue;
    const version = asNonEmptyString(raw.id);
    const releaseDate = asIsoDate(raw.releaseTime);
    if (!version || !releaseDate) continue;
    releases.push({ version, releaseDate, releaseNotes: null, url: null });
  }
  return releases.sort((a, b) => Date.parse(b.releaseDate!) - Date.parse(a.releaseDate!));
}

export interface MinecraftProviderOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
}

export function createMinecraftProvider(options: MinecraftProviderOptions = {}): ProviderFetch {
  const { fetchFn, timeoutMs = 20_000, retries = 2, retryDelayMs = 2000, log } = options;
  let loaded: Promise<OfficialRelease[]> | null = null;

  return async (target: TrackTarget): Promise<AppSnapshot> => {
    const feed = feedFor(target.storeId);
    if (!feed || feed.id !== MINECRAFT_FEED_ID) {
      throw new ProviderError(`Unknown release feed "${target.storeId}"`);
    }
    if (target.platform !== 'windows' && target.platform !== 'mac') {
      throw new ProviderError(`Minecraft: Java Edition has no ${target.platform} listing`);
    }
    loaded ??= withRetry(() => fetchJson(MANIFEST, { timeoutMs, fetchFn }), {
      retries,
      baseDelayMs: retryDelayMs,
      label: 'minecraft:versions',
      log,
    }).then(minecraftReleases);
    let releases: OfficialRelease[];
    try {
      releases = await loaded;
    } catch (error) {
      loaded = null;
      throw error;
    }
    const latest = releases[0];
    if (!latest) throw new ProviderError('Mojang’s version list has no releases');
    return {
      platform: target.platform,
      storeId: feed.id,
      name: feed.product,
      developer: feed.developer,
      iconUrl: null,
      storeUrl: feed.productUrl,
      version: latest.version,
      releaseDate: latest.releaseDate,
      releaseNotes: null,
      category: 'Games',
      bundleId: null,
      price: null,
      contentRating: null,
      requiresOs: null,
      sizeBytes: null,
      rating: null,
      ratingCount: null,
      developerWebsite: feed.productUrl,
      releaseUrl: null,
      releases,
    };
  };
}
