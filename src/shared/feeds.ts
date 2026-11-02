/**
 * Desktop release feeds. Windows and Mac software isn't sold through an app
 * store AppWatch can query, so some desktop products are read from their own
 * public release records (a vendor's announcements, a published version
 * list, or a long-running public tracker). A catalog entry refers to a feed
 * by id:
 *
 *   { "name": "LockDown Browser", "windows": "respondus-lockdown-browser" }
 *
 * The checker side of each feed lives in scripts/lib/providers/.
 */

import type { Platform } from './types.ts';

export interface FeedInfo {
  id: string;
  /** Product name shown when the catalog entry doesn't name it. */
  product: string;
  developer: string;
  /** Desktop platforms this feed publishes releases for. */
  platforms: readonly Extract<Platform, 'windows' | 'mac'>[];
  /** The vendor's product page (downloads are offered from there). */
  productUrl: string;
  /** Human label for where versions come from. */
  sourceLabel: string;
  /** Public page listing the announcements the feed reads. */
  sourceUrl: string;
}

export const FEEDS: Readonly<Record<string, FeedInfo>> = {
  'respondus-lockdown-browser': {
    id: 'respondus-lockdown-browser',
    product: 'LockDown Browser',
    developer: 'Respondus, Inc.',
    platforms: ['windows', 'mac'],
    productUrl: 'https://web.respondus.com/he/lockdownbrowser/',
    sourceLabel: 'Respondus release announcements',
    sourceUrl:
      'https://support.respondus.com/hc/en-us/sections/4409696144411-Respondus-Announcements',
  },
  'roblox-studio': {
    id: 'roblox-studio',
    product: 'Roblox Studio',
    developer: 'Roblox Corporation',
    platforms: ['windows'],
    productUrl: 'https://create.roblox.com/',
    sourceLabel: 'Roblox Client Tracker',
    sourceUrl: 'https://github.com/MaximumADHD/Roblox-Client-Tracker',
  },
  'minecraft-java': {
    id: 'minecraft-java',
    product: 'Minecraft: Java Edition',
    developer: 'Mojang Studios',
    platforms: ['windows', 'mac'],
    productUrl: 'https://www.minecraft.net/',
    sourceLabel: 'Mojang’s version list',
    sourceUrl: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
  },
};

export function feedFor(id: string): FeedInfo | null {
  return Object.prototype.hasOwnProperty.call(FEEDS, id) ? (FEEDS[id] ?? null) : null;
}
