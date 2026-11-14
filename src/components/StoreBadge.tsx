import { STEAM_PREFIX } from '../shared/desktop.ts';
import type { Platform } from '../shared/types.ts';

const LABELS: Record<Platform, string> = {
  apple: 'App Store',
  google: 'Google Play',
  windows: 'Windows',
  mac: 'Mac',
};

export function storeLabel(platform: Platform): string {
  return LABELS[platform];
}

/** The name for one listing: games read from Steam say "Steam", not "Windows". */
export function listingLabel(listing: { platform: Platform; storeId: string }): string {
  return listing.platform === 'windows' && listing.storeId.startsWith(STEAM_PREFIX)
    ? 'Steam'
    : LABELS[listing.platform];
}

/**
 * Listings without version numbers (games) name their updates instead: the
 * first line of the notes is the update's title ("Patch 2.31"), the rest its
 * notes.
 */
export function splitUpdateTitle(notes: string | null): {
  title: string | null;
  body: string | null;
} {
  if (!notes) return { title: null, body: null };
  const [first = '', ...rest] = notes.split('\n');
  const title = first.trim();
  const body = rest.join('\n').trim();
  if (!title || title.length > 140) return { title: null, body: notes };
  return { title, body: body || null };
}

/**
 * Platform identity: a colored dot plus the platform's name, so it is never
 * conveyed by color alone (App Store blue, Google Play green, Windows cyan,
 * Mac orange).
 */
/**
 * An update title without the game's own name in front, for tight spaces:
 * "Counter-Strike 2 Update" on Counter-Strike 2's card reads "Update",
 * "Apex Legends: Latest Update 11/12" reads "Latest Update 11/12".
 */
export function shortUpdateTitle(title: string, appName: string): string {
  const plain = (text: string) => text.replace(/[™®©]/g, '').toLowerCase();
  const name = plain(appName).trim();
  if (!name || !plain(title).startsWith(name)) return title;
  // Cut by counting letters, so stripped symbols don't shift the cut.
  let seen = 0;
  let cut = 0;
  while (cut < title.length && seen < name.length) {
    if (!/[™®©]/.test(title[cut]!)) seen += 1;
    cut += 1;
  }
  // The name must end at a word break ("Cyberpunk 2077's …" keeps its name).
  if (!/^[\s™®©:|–—-]/.test(title.slice(cut))) return title;
  const rest = title.slice(cut).replace(/^[\s™®©:|–—-]+/, '');
  return rest.length >= 3 ? rest.charAt(0).toUpperCase() + rest.slice(1) : title;
}

export function StoreBadge({
  platform,
  compact = false,
}: {
  platform: Platform;
  compact?: boolean;
}) {
  return (
    <span class={`store-badge store-badge--${platform}${compact ? ' store-badge--compact' : ''}`}>
      <span class="store-badge__dot" aria-hidden="true" />
      {LABELS[platform]}
    </span>
  );
}
