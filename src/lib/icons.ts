/**
 * App icon URLs. Every icon on the site is requested at one size, so a card,
 * the timeline and the app page all share the same cached image: once an
 * icon has loaded anywhere it shows instantly everywhere else.
 */

/** 2x the largest icon shown (the 96px app page icon). */
export const ICON_PX = 192;

/** Ask the store CDNs for a 192px icon instead of the 512px original. */
export function iconSrc(url: string): string {
  if (/^https:\/\/[a-z0-9-]+\.mzstatic\.com\//.test(url)) {
    return url.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/, `/${ICON_PX}x${ICON_PX}bb.$1`);
  }
  if (/^https:\/\/play-lh\.googleusercontent\.com\//.test(url)) {
    return url.replace(/=[swh]\d+[a-z0-9-]*$/, '') + `=s${ICON_PX}`;
  }
  return url;
}
