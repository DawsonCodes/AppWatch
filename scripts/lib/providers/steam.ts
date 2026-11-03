/**
 * Game updates from Steam (listed under Windows, as "steam:<app id>").
 *
 * Games aren't versioned like apps: most never show a version number. What
 * they do publish is patch notes, and on Steam developers post those as
 * announcements on the game's news hub. Steam's public news API
 * (ISteamNews/GetNewsForApp, keyless) returns those announcements; this
 * provider keeps the ones that are patch notes and records each as an update
 * on its date, with its notes. The store API (appdetails, also keyless) adds
 * the game's developer, price, genre and age rating when it's available.
 *
 * Per listing and run: one news request and one store request.
 */

import { desktopSourceFor } from '../../../src/shared/desktop.ts';
import { decodeEntities, htmlToPlainText, truncate } from '../../../src/shared/text.ts';
import type { TrackTarget } from '../config.ts';
import { errorMessage, fetchJson, withRetry } from '../net.ts';
import type { AppSnapshot, OfficialRelease, ProviderFetch } from './types.ts';
import { asNonEmptyString, ProviderError } from './types.ts';

const NEWS_API = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/';
const STORE_API = 'https://store.steampowered.com/api/appdetails';
const ITEMS_API = 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/';
/** Announcements read per game (patch notes are a share of them). */
const NEWS_COUNT = 200;
/** Patch notes kept as history per run. */
const MAX_RELEASES = 40;
const MAX_NOTES = 4000;

/** Titles that announce a game update. */
const PATCH_TITLE =
  /\b(patch(?:es)?|hot ?fix(?:es)?|update[ds]?|release notes|change ?log|bug ?fix(?:es)?|fixes|balance (?:changes|post|update)|version \d|(?:is |now )live|out now)\b|\bv?\d+\.\d+(?:\.\d+)*\b/i;
/** …and posts that only talk about one, or about something else. */
const NOT_A_PATCH =
  /\b(coming soon|coming to|what's coming|what’s coming|upcoming|roadmap|teaser|trailer|preview|sneak peek|dev(?:eloper)? ?(?:update|diary|blog|q&a|vision|stream)|devstream|community crunch|newsletter|recap|sale|discount|giveaway|free weekend|tournament|esports|livestream|twitch drops|survey|merch|wallpaper|contest|community spotlight|known issues|patch day schedule)\b/i;

export interface SteamNewsItem {
  title: string;
  contents: string;
  url: string | null;
  /** Unix seconds. */
  date: number;
  tags: string[];
}

function toNewsItem(value: unknown): SteamNewsItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const title = asNonEmptyString(raw.title);
  const date = typeof raw.date === 'number' ? raw.date : Number(raw.date);
  if (!title || !Number.isFinite(date) || date <= 0) return null;
  // Only the developer's own announcements: external news sites can repost anything.
  if (raw.feedname !== undefined && raw.feedname !== 'steam_community_announcements') return null;
  const url = asNonEmptyString(raw.url);
  return {
    title: decodeEntities(title),
    contents: typeof raw.contents === 'string' ? raw.contents : '',
    url: url && url.startsWith('https://') ? url : null,
    date,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
  };
}

/** Steam announcement markup (BBCode, sometimes HTML) to plain text. */
export function steamToPlainText(contents: string): string {
  const text = contents
    .replace(/\{STEAM_CLAN_IMAGE\}[^\s\]]*/g, '')
    .replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, '')
    .replace(/\[(previewyoutube|video)[^\]]*\][\s\S]*?\[\/\1\]/gi, '')
    .replace(/\[\*\]\s*/g, '\n• ')
    .replace(/\[\/?(h[1-6]|p|list|olist|quote|table|tr)\b[^\]]*\]/gi, '\n')
    .replace(/\[\/?(td|th)\b[^\]]*\]/gi, ' ')
    .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[\/?[a-z]+(?:=[^\]]*)?\]/gi, '');
  return htmlToPlainText(text);
}

/**
 * The announcements that are patch notes: posts the developer tagged as
 * patch notes on Steam ("patchnotes"), or titled like an update ("Patch 1.2",
 * "Hotfix #36", "Update 2.3 is live", "Version 20261030 Patch Notes").
 * Developers tag inconsistently, so either is enough; posts that only talk
 * about an update (previews, roadmaps, weekly news, dev diaries) never count.
 */
export function patchNotesOf(items: readonly SteamNewsItem[]): SteamNewsItem[] {
  return items
    .filter(
      (item) =>
        (item.tags.includes('patchnotes') || PATCH_TITLE.test(item.title)) &&
        !NOT_A_PATCH.test(item.title),
    )
    .sort((a, b) => b.date - a.date);
}

/** Patch notes as releases (newest first); several posts on one day are one update. */
export function steamReleases(items: readonly SteamNewsItem[]): OfficialRelease[] {
  const releases: OfficialRelease[] = [];
  const days = new Set<string>();
  for (const item of patchNotesOf(items)) {
    const day = new Date(item.date * 1000).toISOString().slice(0, 10);
    if (days.has(day)) continue;
    days.add(day);
    const body = steamToPlainText(item.contents);
    releases.push({
      version: null,
      releaseDate: new Date(item.date * 1000).toISOString(),
      releaseNotes: truncate(body ? `${item.title}\n\n${body}` : item.title, MAX_NOTES),
      url: item.url,
    });
    if (releases.length >= MAX_RELEASES) break;
  }
  return releases;
}

interface StoreDetails {
  name: string | null;
  developer: string | null;
  price: string | null;
  category: string | null;
  contentRating: string | null;
  website: string | null;
}

export function parseStoreDetails(payload: unknown, appId: string): StoreDetails | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const entry = (payload as Record<string, unknown>)[appId] as Record<string, unknown> | undefined;
  if (!entry || entry.success !== true || typeof entry.data !== 'object' || !entry.data) {
    return null;
  }
  const data = entry.data as Record<string, unknown>;
  const first = (value: unknown): string | null =>
    Array.isArray(value) ? asNonEmptyString(value[0]) : null;
  const priceOverview = data.price_overview as Record<string, unknown> | undefined;
  const genres = Array.isArray(data.genres) ? (data.genres as Record<string, unknown>[]) : [];
  const age = Number(data.required_age);
  const website = asNonEmptyString(data.website);
  return {
    name: asNonEmptyString(data.name),
    developer: first(data.developers) ?? first(data.publishers),
    price:
      data.is_free === true ? 'Free' : (asNonEmptyString(priceOverview?.final_formatted) ?? null),
    category: asNonEmptyString(genres[0]?.description),
    contentRating: Number.isFinite(age) && age > 0 ? `${age}+` : null,
    website: website && /^https?:\/\//.test(website) ? website : null,
  };
}

/**
 * Icons for a game, best first, from IStoreBrowseService/GetItems (the
 * public store API the Steam store itself uses): its official community
 * avatar (square, 184px) when Steam lists one; otherwise its store cover
 * art (hero capsule, 748×896, then the 600×900 library cover), which the
 * site crops to a square; and only as a last resort the 32px app icon,
 * which looks blurry at card size.
 */
export function steamIconCandidates(payload: unknown, appId: string): string[] {
  const response = (payload as { response?: { store_items?: unknown[] } } | null)?.response;
  const item = (response?.store_items ?? []).find(
    (value) => String((value as Record<string, unknown> | null)?.appid) === appId,
  ) as { assets?: Record<string, unknown> } | undefined;
  const assets = item?.assets ?? {};
  const hash = (value: unknown) =>
    typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : null;
  const candidates: string[] = [];
  const clan = hash(assets.clan_avatar);
  if (clan) candidates.push(`https://avatars.fastly.steamstatic.com/${clan}_full.jpg`);
  // Store art: "steam/apps/730/${FILENAME}?t=…" plus a file name per asset.
  const format = typeof assets.asset_url_format === 'string' ? assets.asset_url_format : '';
  if (format.startsWith(`steam/apps/${appId}/`) && format.includes('${FILENAME}')) {
    for (const key of [
      'hero_capsule_2x',
      'hero_capsule',
      'library_capsule_2x',
      'library_capsule',
    ]) {
      const file = assets[key];
      if (
        typeof file === 'string' &&
        /^[\w./-]+\.(?:jpg|png|webp)$/i.test(file) &&
        !file.includes('..')
      ) {
        candidates.push(
          `https://shared.fastly.steamstatic.com/store_item_assets/${format.replace('${FILENAME}', file)}`,
        );
      }
    }
  }
  const icon = hash(assets.community_icon);
  if (icon) {
    candidates.push(
      `https://shared.fastly.steamstatic.com/community_assets/images/apps/${appId}/${icon}.jpg`,
    );
  }
  return candidates;
}

export interface SteamProviderOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
}

export function createSteamProvider(options: SteamProviderOptions = {}): ProviderFetch {
  const { fetchFn, timeoutMs = 20_000, retries = 2, retryDelayMs = 2000, log } = options;

  function get(url: string, label: string): Promise<unknown> {
    return withRetry(() => fetchJson(url, { timeoutMs, fetchFn }), {
      retries,
      baseDelayMs: retryDelayMs,
      label,
      log,
    });
  }

  /** The first candidate that really serves an image (so the site never shows a broken one). */
  async function firstImage(urls: readonly string[]): Promise<string | null> {
    for (const url of urls) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await (fetchFn ?? fetch)(url, {
          redirect: 'follow',
          signal: controller.signal,
        });
        const type = response.headers.get('content-type') ?? '';
        await response.body?.cancel().catch(() => {});
        if (response.ok && type.startsWith('image/')) return url;
      } catch {
        // Try the next one.
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  return async (target: TrackTarget): Promise<AppSnapshot> => {
    const source = desktopSourceFor(target.platform, target.storeId);
    if (source?.kind !== 'steam') {
      throw new ProviderError(`Not a Steam listing: "${target.storeId}"`);
    }
    const { appId } = source;
    const newsUrl = `${NEWS_API}?${new URLSearchParams({
      appid: appId,
      count: String(NEWS_COUNT),
      maxlength: '0',
      feeds: 'steam_community_announcements',
      format: 'json',
    })}`;
    const news = (await get(newsUrl, `steam:news:${appId}`)) as {
      appnews?: { newsitems?: unknown[] };
    } | null;
    const items = (news?.appnews?.newsitems ?? [])
      .map(toNewsItem)
      .filter((item): item is SteamNewsItem => item !== null);
    const releases = steamReleases(items);
    const latest = releases[0];
    if (!latest) throw new ProviderError(`No patch notes on Steam for app ${appId}`);

    let iconUrl: string | null = null;
    try {
      const items = await get(
        `${ITEMS_API}?${new URLSearchParams({
          input_json: JSON.stringify({
            ids: [{ appid: Number(appId) }],
            context: { language: 'english', country_code: target.country.toUpperCase() },
            data_request: { include_assets: true },
          }),
        })}`,
        `steam:items:${appId}`,
      );
      iconUrl = await firstImage(steamIconCandidates(items, appId));
    } catch (error) {
      log?.(`warning: Steam icon for ${appId} unavailable (${errorMessage(error)})`);
    }

    let details: StoreDetails | null = null;
    try {
      details = parseStoreDetails(
        await get(
          `${STORE_API}?${new URLSearchParams({ appids: appId, cc: target.country, l: 'english' })}`,
          `steam:store:${appId}`,
        ),
        appId,
      );
    } catch (error) {
      log?.(`warning: Steam store details for ${appId} unavailable (${errorMessage(error)})`);
    }

    return {
      platform: 'windows',
      storeId: target.storeId,
      name: details?.name ?? `Steam app ${appId}`,
      developer: details?.developer ?? null,
      iconUrl,
      storeUrl: source.storeUrl,
      version: null,
      releaseDate: latest.releaseDate,
      releaseNotes: latest.releaseNotes,
      category: details?.category ?? 'Games',
      bundleId: null,
      price: details?.price ?? null,
      contentRating: details?.contentRating ?? null,
      requiresOs: null,
      sizeBytes: null,
      rating: null,
      ratingCount: null,
      developerWebsite: details?.website ?? null,
      releaseUrl: latest.url,
      releases,
    };
  };
}
