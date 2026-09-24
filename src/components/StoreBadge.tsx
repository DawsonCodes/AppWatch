import type { Platform } from '../shared/types.ts';

const LABELS: Record<Platform, string> = {
  apple: 'App Store',
  google: 'Google Play',
};

export function storeLabel(platform: Platform): string {
  return LABELS[platform];
}

/**
 * Store identity: a colored dot plus the store's name, so the store is never
 * conveyed by color alone (App Store blue, Google Play green).
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
