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

/**
 * Platform identity: a colored dot plus the platform's name, so it is never
 * conveyed by color alone (App Store blue, Google Play green, Windows cyan,
 * Mac orange).
 */
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
