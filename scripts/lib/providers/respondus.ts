/**
 * Respondus LockDown Browser release feed (Windows and Mac).
 *
 * LockDown Browser isn't distributed through an app store AppWatch can query
 * on desktop: each school hands out its own download link. Respondus does,
 * however, announce every desktop release on its official help center
 * ("LockDown Browser for Windows, version 2.1.6.02", with notes), and that
 * help center has the standard public Zendesk Help Center API. This provider
 * reads those announcements — read-only, keyless, a few requests per run —
 * and turns them into a version history.
 *
 * This provider only handles public release metadata. The separate, optional
 * private archive step never adds installers to AppWatch or its public data.
 */

import { htmlToPlainText } from '../../../src/shared/text.ts';
import { feedFor } from '../../../src/shared/feeds.ts';
import type { TrackTarget } from '../config.ts';
import { errorMessage, fetchJson, withRetry } from '../net.ts';
import type { AppSnapshot, OfficialRelease, ProviderFetch } from './types.ts';
import { asIsoDate, asNonEmptyString, ProviderError } from './types.ts';

export const RESPONDUS_FEED_ID = 'respondus-lockdown-browser';

const HELP_CENTER = 'https://support.respondus.com/api/v2/help_center';
/** "Respondus Announcements", where desktop releases are posted. */
const ANNOUNCEMENTS_SECTION = '4409696144411';
const MAX_PAGES = 6;

type DesktopPlatform = 'windows' | 'mac';

/** "LockDown Browser for Windows, Version 2.1.6.02" / "... for Mac, version 2.1.5.00". */
const TITLE = /LockDown Browser for (Windows|Mac)(?:OS)?\b.*?\bversion\s+(\d+(?:\.\d+){1,4})\b/i;

const MAX_NOTES = 4000;

interface Article {
  id: number;
  title: string;
  body: string;
  url: string | null;
  createdAt: string | null;
}

function toArticle(value: unknown): Article | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.draft === true) return null;
  const title = asNonEmptyString(raw.title) ?? asNonEmptyString(raw.name);
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  if (!title || !Number.isFinite(id)) return null;
  const url = asNonEmptyString(raw.html_url);
  return {
    id,
    title,
    body: typeof raw.body === 'string' ? raw.body : '',
    url: url && url.startsWith('https://') ? url : null,
    createdAt: asIsoDate(raw.created_at) ?? asIsoDate(raw.edited_at),
  };
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** "16 June 2021", "6 February, 2026", "June 16, 2021", "2026-09-26" -> ISO (noon UTC). */
export function parseLooseDate(text: string): string | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]) - 1;
    day = Number(iso[3]);
  } else {
    const dayFirst = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+),?\s+(\d{4})/i.exec(text);
    const monthFirst = /([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(text);
    const parts = dayFirst
      ? { d: dayFirst[1]!, m: dayFirst[2]!, y: dayFirst[3]! }
      : monthFirst
        ? { d: monthFirst[2]!, m: monthFirst[1]!, y: monthFirst[3]! }
        : null;
    if (!parts) return null;
    month = MONTHS.findIndex((name) => name.startsWith(parts.m.toLowerCase().slice(0, 3)));
    if (month < 0 || parts.m.length < 3) return null;
    year = Number(parts.y);
    day = Number(parts.d);
  }
  const date = new Date(Date.UTC(year, month, day, 12));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day || year < 2000) return null;
  return date.toISOString();
}

/**
 * The date in an announcement's "Posted by Respondus Support on 16 June 2021"
 * byline. Posts migrated into the current help center all carry the
 * migration date as their creation date, so the byline is the real one.
 */
export function bylineDate(html: string): string | null {
  const match = /^\s*Posted by [^\n]*?\bon\s+([^\n]+)/im.exec(htmlToPlainText(html));
  return match ? parseLooseDate(match[1]!) : null;
}

/** Prefer the byline date when it disagrees with the post's creation date by over a day. */
function releaseDateOf(article: Article): string | null {
  const byline = bylineDate(article.body);
  if (!byline) return article.createdAt;
  if (!article.createdAt) return byline;
  const apart = Math.abs(Date.parse(byline) - Date.parse(article.createdAt));
  return apart > 36 * 60 * 60 * 1000 ? byline : article.createdAt;
}

/** Announcement body -> plain-text notes, without the "Posted by …" byline. */
export function announcementNotes(html: string): string | null {
  const text = htmlToPlainText(html)
    .replace(/^\s*Posted by [^\n]*(?:\n+|$)/i, '')
    .trim();
  if (!text) return null;
  return text.length > MAX_NOTES ? `${text.slice(0, MAX_NOTES).trimEnd()}…` : text;
}

/**
 * Pick the desktop releases out of a list of help-center articles, newest
 * first. A version announced twice keeps its earliest announcement.
 */
export function parseAnnouncements(
  rawArticles: readonly unknown[],
): Record<DesktopPlatform, OfficialRelease[]> {
  const byPlatform: Record<DesktopPlatform, Map<string, OfficialRelease & { t: number }>> = {
    windows: new Map(),
    mac: new Map(),
  };
  for (const raw of rawArticles) {
    const article = toArticle(raw);
    if (!article) continue;
    const match = TITLE.exec(article.title);
    if (!match) continue;
    const platform = match[1]!.toLowerCase() as DesktopPlatform;
    const version = match[2]!;
    const releaseDate = releaseDateOf(article);
    const time = releaseDate ? Date.parse(releaseDate) : Number.NaN;
    const existing = byPlatform[platform].get(version);
    if (existing && !(Number.isFinite(time) && time < existing.t)) continue;
    byPlatform[platform].set(version, {
      version,
      releaseDate,
      releaseNotes: announcementNotes(article.body),
      url: article.url,
      t: Number.isFinite(time) ? time : 0,
    });
  }
  const sorted = (map: Map<string, OfficialRelease & { t: number }>): OfficialRelease[] =>
    [...map.values()].sort((a, b) => b.t - a.t).map(({ t: _t, ...release }) => release);
  return { windows: sorted(byPlatform.windows), mac: sorted(byPlatform.mac) };
}

interface RespondusProviderOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
}

/**
 * One provider for both desktop platforms. The announcements are fetched once
 * per run and shared by the Windows and Mac listings.
 */
export function createRespondusProvider(options: RespondusProviderOptions = {}): ProviderFetch {
  const { fetchFn, timeoutMs = 20_000, retries = 2, retryDelayMs = 2000, log } = options;
  let loaded: Promise<Record<DesktopPlatform, OfficialRelease[]>> | null = null;

  function get(url: string, label: string): Promise<unknown> {
    return withRetry(() => fetchJson(url, { timeoutMs, fetchFn }), {
      retries,
      baseDelayMs: retryDelayMs,
      label,
      log,
    });
  }

  /** Follow a paginated Help Center listing, collecting `articles`/`results`. */
  async function collect(firstUrl: string, label: string): Promise<unknown[]> {
    const items: unknown[] = [];
    let url: string | null = firstUrl;
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const payload = (await get(url, label)) as Record<string, unknown> | null;
      const list = payload?.articles ?? payload?.results;
      if (Array.isArray(list)) items.push(...list);
      const next = payload?.next_page;
      url = typeof next === 'string' && next.startsWith(HELP_CENTER) ? next : null;
    }
    return items;
  }

  async function load(): Promise<Record<DesktopPlatform, OfficialRelease[]>> {
    const sources = [
      collect(
        `${HELP_CENTER}/en-us/sections/${ANNOUNCEMENTS_SECTION}/articles.json?per_page=100&sort_by=created_at&sort_order=desc`,
        'respondus:announcements',
      ),
      // Search as well, in case a release is filed outside the announcements.
      ...['LockDown Browser for Windows', 'LockDown Browser for Mac'].map((query) =>
        collect(
          `${HELP_CENTER}/articles/search.json?${new URLSearchParams({ query, locale: 'en-us', per_page: '100' })}`,
          'respondus:search',
        ),
      ),
    ];
    const settled = await Promise.allSettled(sources);
    const articles = settled.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    );
    if (settled.every((result) => result.status === 'rejected')) {
      const first = settled[0] as PromiseRejectedResult;
      throw new ProviderError(`Respondus help center unavailable: ${errorMessage(first.reason)}`);
    }
    for (const result of settled) {
      if (result.status === 'rejected') {
        log?.(`warning: a Respondus help-center request failed (${errorMessage(result.reason)})`);
      }
    }
    return parseAnnouncements(articles);
  }

  return async (target: TrackTarget): Promise<AppSnapshot> => {
    const feed = feedFor(target.storeId);
    if (!feed || feed.id !== RESPONDUS_FEED_ID) {
      throw new ProviderError(`Unknown release feed "${target.storeId}"`);
    }
    if (target.platform !== 'windows' && target.platform !== 'mac') {
      throw new ProviderError(`The Respondus feed has no ${target.platform} releases`);
    }
    loaded ??= load();
    let releases: OfficialRelease[];
    try {
      releases = (await loaded)[target.platform];
    } catch (error) {
      loaded = null; // let the next listing in this run try again
      throw error;
    }
    const latest = releases[0];
    if (!latest) {
      throw new ProviderError(
        `No "LockDown Browser for ${target.platform === 'windows' ? 'Windows' : 'Mac'}" release announcements found`,
      );
    }
    return {
      platform: target.platform,
      storeId: feed.id,
      name: feed.product,
      developer: feed.developer,
      iconUrl: null,
      storeUrl: feed.productUrl,
      version: latest.version,
      releaseDate: latest.releaseDate,
      releaseNotes: latest.releaseNotes,
      category: 'Education',
      bundleId: null,
      price: 'Free',
      contentRating: null,
      requiresOs: null,
      sizeBytes: null,
      rating: null,
      ratingCount: null,
      developerWebsite: 'https://web.respondus.com/',
      releaseUrl: latest.url,
      releases,
    };
  };
}
