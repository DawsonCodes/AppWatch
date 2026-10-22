/**
 * Hash routes. The site is a single static page on GitHub Pages, so pages are
 * addressed by the URL hash: `#app=apple:123` is an app's page, anything else
 * is the app list. Links are plain anchors, so Back, Forward, new tabs and
 * copied links all work the way they do on any website.
 */

export type Route = { page: 'list' } | { page: 'app'; listingId: string };

export function parseRoute(hash: string): Route {
  const match = /^#app=(.+)$/.exec(hash);
  if (!match) return { page: 'list' };
  let listingId: string;
  try {
    listingId = decodeURIComponent(match[1] ?? '');
  } catch {
    return { page: 'list' };
  }
  return listingId ? { page: 'app', listingId } : { page: 'list' };
}

/** The href for an app's page, e.g. `#app=google%3Acom.spotify.music`. */
export function appHref(listingId: string): string {
  return `#app=${encodeURIComponent(listingId)}`;
}
