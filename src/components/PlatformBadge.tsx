import type { Platform } from '../shared/types.ts';

const LABELS: Record<Platform, string> = {
  apple: 'App Store',
  google: 'Google Play',
};

/** Text-first badge — the platform is never conveyed by color alone. */
export function PlatformBadge({ platform }: { platform: Platform }) {
  return <span class={`platform-badge platform-badge--${platform}`}>{LABELS[platform]}</span>;
}

export function platformLabel(platform: Platform): string {
  return LABELS[platform];
}
