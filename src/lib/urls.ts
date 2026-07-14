/**
 * Base-path-safe URL helpers. The site is served from /AppWatch/ on GitHub
 * Pages (and from / in local dev), so every runtime URL must be built relative
 * to Vite's BASE_URL rather than the domain root.
 */

export function withBase(path: string, base: string = import.meta.env.BASE_URL): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return normalizedBase + path.replace(/^\/+/, '');
}

export function dataUrl(fileName: string, base?: string): string {
  return withBase(`data/${fileName}`, base);
}
