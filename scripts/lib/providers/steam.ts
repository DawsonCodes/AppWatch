/**
 * Game updates from Steam (listed under Windows, as "steam:<app id>").
 *
 * Games aren't versioned like apps: most never show a version number. What
 * they do publish is patch notes, and on Steam developers post those as
 * announcements on the game's news hub, marking each post with a type:
 * small update, regular update, major update, news, in-game event, stream,
 * sale and so on. The Steam client's own "Updates" filter uses those types.
 *
 * This provider reads the game's events (the store's public, keyless events
 * feed) and keeps the ones that are updates:
 *
 *  - posts the developer marked as an update (small, regular or major);
 *  - posts marked as plain news but titled or tagged like patch notes,
 *    because some developers file real patches as news ("Version 20261105
 *    Patch Notes", "Latest Update 11/12/2026");
 *  - never posts about something that hasn't shipped or isn't a game update
 *    (previews, community news, anti-cheat notices, esports, store posts),
 *    whatever they are marked as, and never streams, sales or in-game events.
 *
 * Each is recorded as an update on the date it was posted, with its notes.
 * If the events feed is unavailable, Steam's news API (ISteamNews, also
 * keyless) is read instead and titles alone decide. The store API adds the
 * game's developer, price, genre, age rating and cover art.
 *
 * Per listing and run: one events request and two store requests.
 */

import { desktopSourceFor } from '../../../src/shared/desktop.ts';
import { decodeEntities, htmlToPlainText, truncate } from '../../../src/shared/text.ts';
import type { TrackTarget } from '../config.ts';
import { errorMessage, fetchJson, withRetry } from '../net.ts';
import type { AppSnapshot, OfficialRelease, ProviderFetch } from './types.ts';
import { asNonEmptyString, ProviderError } from './types.ts';

const EVENTS_API = 'https://store.steampowered.com/events/ajaxgetpartnereventspageable/';
const NEWS_API = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/';
const STORE_API = 'https://store.steampowered.com/api/appdetails';
const ITEMS_API = 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/';
/** Events read per game (updates are a share of them). */
const EVENT_COUNT = 100;
/** Announcements read per game from the fallback news API. */
const NEWS_COUNT = 200;

/** Steam's event types for "small update / patch notes", "regular update" and "major update". */
const SMALL_UPDATE = 12;
const REGULAR_UPDATE = 13;
const MAJOR_UPDATE = 14;
/** Plain posts ("other" and "news"): the title decides. */
const NEWS_TYPES = new Set([1, 28]);
/** Patch notes kept as history per run. */
const MAX_RELEASES = 40;
const MAX_NOTES = 4000;

/** Titles that announce a game update. */
const PATCH_TITLE =
  /\b(patch(?:es)?|hot ?fix(?:es)?|update[ds]?|release notes|change ?log|bug ?fix(?:es)?|fixes|balance (?:changes|post|update)|version \d)\b|\bv?\d+\.\d+(?:\.\d+)*\b/i;
/**
 * "…is live" / "…out now": only a hint. Used when a post has no type (the
 * news API); with types, developers mark real launches as updates, and
 * plain news saying "live" is usually an event, a stream or a store item.
 */
const LAUNCH_TITLE = /\b(?:(?:is |are |now )live|out now)\b/i;
function anyOf(groups: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${groups.map((group) => `(?:${group})`).join('|')})\\b`, 'i');
}

/** Posts about an update that hasn't shipped. */
const NOT_YET = anyOf([
  "coming soon|coming to|is coming|are coming|what's coming|what’s coming|upcoming",
  'roadmap|teaser|trailer|preview|sneak peek',
  '(?:launch|releas)(?:es|ing) (?:on )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \\d+',
]);

/** Posts that aren't a game update: news, community, developer, store and esports posts. */
const NOT_AN_UPDATE = anyOf([
  'dev(?:eloper)? ?(?:update|diary|blog|q&a|vision|letter)|\\w*streams?|community (?:update|crunch|spotlight)',
  'an update from|anti[- ]?cheat|bans? notice|service report|newsletter|recap|known issues|patch day schedule',
  'survey|poll|vote|steam awards|contest|challenge|wallpaper|merch|soundtrack',
  'sale|discount|bundles?|store update|giveaway|free weekend|tournament|esports|grand finals?|finals? day|twitch drops',
  'global series|pgs \\d+|(?:survival|winners|final|group|knockout|playoff) stage',
]);

export interface SteamNewsItem {
  title: string;
  contents: string;
  url: string | null;
  /** Unix seconds. */
  date: number;
  tags: string[];
  /** Steam's event type, when read from the events feed (absent from the news API). */
  type?: number;
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

/** One event from the store's events feed, or null for anything unusable. */
function toEventItem(value: unknown, appId: string): SteamNewsItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const body = (raw.announcement_body ?? {}) as Record<string, unknown>;
  const title = asNonEmptyString(raw.event_name) ?? asNonEmptyString(body.headline);
  const type = Number(raw.event_type);
  // The post time is what the news API reports as the date, so records read
  // from either source line up; events without a post fall back to their start.
  const posted = Number(body.posttime);
  const date = Number.isFinite(posted) && posted > 0 ? posted : Number(raw.rtime32_start_time);
  if (!title || !Number.isInteger(type) || !Number.isFinite(date) || date <= 0) return null;
  if (Number(raw.hidden) === 1 || Number(raw.published) === 0 || Number(raw.unlisted) === 1) {
    return null;
  }
  const gid = asNonEmptyString(raw.gid);
  let tags: string[] = [];
  if (Array.isArray(body.tags)) {
    tags = body.tags.filter((tag): tag is string => typeof tag === 'string');
  } else if (typeof body.tags === 'string') {
    tags = body.tags.match(/[\w-]+/g) ?? [];
  }
  return {
    title: decodeEntities(title),
    contents: typeof body.body === 'string' ? body.body : '',
    url:
      gid && /^\d+$/.test(gid)
        ? `https://store.steampowered.com/news/app/${appId}/view/${gid}`
        : null,
    date,
    tags,
    type,
  };
}

/** The usable events in an events-feed response, or null if it isn't one. */
export function parseSteamEvents(payload: unknown, appId: string): SteamNewsItem[] | null {
  const events = (payload as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return null;
  return events
    .map((event) => toEventItem(event, appId))
    .filter((item): item is SteamNewsItem => item !== null);
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

/** Whether one announcement is a game update (see the notes at the top of this file). */
export function isGameUpdate(item: SteamNewsItem): boolean {
  if (NOT_YET.test(item.title)) return false;
  // A post the developer marked as a major update is one, whatever its title.
  if (item.type === MAJOR_UPDATE) return true;
  if (NOT_AN_UPDATE.test(item.title)) return false;
  if (item.type === SMALL_UPDATE || item.type === REGULAR_UPDATE) return true;
  // Streams, sales, in-game events and the like are never updates.
  if (item.type !== undefined && !NEWS_TYPES.has(item.type)) return false;
  // Plain news (or the news API, which has no types): the title or tag decides.
  if (item.tags.includes('patchnotes') || PATCH_TITLE.test(item.title)) return true;
  return item.type === undefined && LAUNCH_TITLE.test(item.title);
}

/** How sure the signal is (for picking one post when several land on a day). */
function updateWeight(item: SteamNewsItem): number {
  if (item.type === MAJOR_UPDATE) return 3;
  if (item.type === SMALL_UPDATE || item.type === REGULAR_UPDATE) return 2;
  return /\bpatch notes\b/i.test(item.title) || item.tags.includes('patchnotes') ? 1 : 0;
}

/** The announcements that are game updates, newest first; nothing dated in the future. */
export function patchNotesOf(
  items: readonly SteamNewsItem[],
  now: number = Date.now(),
): SteamNewsItem[] {
  return items
    .filter((item) => item.date * 1000 <= now && isGameUpdate(item))
    .sort((a, b) => b.date - a.date);
}

/**
 * Updates as releases (newest first). Several posts on one day are one
 * update: the one most clearly marked as an update, else the latest.
 */
export function steamReleases(
  items: readonly SteamNewsItem[],
  now: number = Date.now(),
): OfficialRelease[] {
  const byDay = new Map<string, SteamNewsItem>();
  for (const item of patchNotesOf(items, now)) {
    const day = new Date(item.date * 1000).toISOString().slice(0, 10);
    const chosen = byDay.get(day);
    if (!chosen || updateWeight(item) > updateWeight(chosen)) byDay.set(day, item);
  }
  const releases: OfficialRelease[] = [];
  for (const item of byDay.values()) {
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
    // Events carry the developer's own "this is an update" marking; the news
    // API is the fallback when the events feed can't be read.
    let items: SteamNewsItem[] | null = null;
    try {
      items = parseSteamEvents(
        await get(
          `${EVENTS_API}?${new URLSearchParams({
            clan_accountid: '0',
            appid: appId,
            offset: '0',
            count: String(EVENT_COUNT),
            l: 'english',
          })}`,
          `steam:events:${appId}`,
        ),
        appId,
      );
    } catch (error) {
      log?.(`warning: Steam events for ${appId} unavailable (${errorMessage(error)})`);
    }
    if (!items || items.length === 0) {
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
      items = (news?.appnews?.newsitems ?? [])
        .map(toNewsItem)
        .filter((item): item is SteamNewsItem => item !== null);
    }
    const releases = steamReleases(items);
    const latest = releases[0];
    if (!latest) throw new ProviderError(`No patch notes on Steam for app ${appId}`);

    let iconUrl: string | null = null;
    try {
      const storeItems = await get(
        `${ITEMS_API}?${new URLSearchParams({
          input_json: JSON.stringify({
            ids: [{ appid: Number(appId) }],
            context: { language: 'english', country_code: target.country.toUpperCase() },
            data_request: { include_assets: true },
          }),
        })}`,
        `steam:items:${appId}`,
      );
      iconUrl = await firstImage(steamIconCandidates(storeItems, appId));
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
