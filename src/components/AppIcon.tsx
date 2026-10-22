import { useState } from 'preact/hooks';
import { iconSrc } from '../lib/icons.ts';

interface AppIconProps {
  name: string;
  iconUrl: string | null;
  /** Rendered size in CSS pixels. */
  size: number;
  class?: string;
  /** Load immediately instead of when scrolled near (use above the fold). */
  eager?: boolean;
}

/**
 * Icon loads are remembered for the whole visit. An icon that loaded once
 * shows at once wherever it appears next, and one that failed isn't retried
 * (and doesn't pop in later) every time a list re-renders.
 */
const loaded = new Set<string>();
const failed = new Set<string>();

/**
 * App icon on a solid tile. The app's first letter shows straight away and
 * the real icon fades in over it once it has loaded. If the icon can't load,
 * the letter stays, so there is never an empty or broken box.
 */
export function AppIcon({
  name,
  iconUrl,
  size,
  class: className = '',
  eager = false,
}: AppIconProps) {
  const src = iconUrl ? iconSrc(iconUrl) : null;
  // Only used to re-render once the image settles; the sets are the truth.
  const [, setSettled] = useState<string | null>(null);
  const status = !src || failed.has(src) ? 'failed' : loaded.has(src) ? 'loaded' : 'loading';
  const letter = name.trim().charAt(0).toUpperCase() || '?';

  const markLoaded = (img: HTMLImageElement) => {
    if (!src || img.naturalWidth === 0) return;
    loaded.add(src);
    setSettled(src);
  };

  return (
    <span
      class={`app-icon${status === 'loaded' ? ' is-loaded' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px` }}
      aria-hidden="true"
    >
      <span class="app-icon__letter">{letter}</span>
      {src && status !== 'failed' ? (
        <img
          key={src}
          class="app-icon__img"
          src={src}
          alt=""
          width={size}
          height={size}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerpolicy="no-referrer"
          ref={(img) => {
            // Already in the browser cache: no load event is coming.
            if (img?.complete) markLoaded(img);
          }}
          onLoad={(event) => markLoaded(event.currentTarget)}
          onError={() => {
            failed.add(src);
            setSettled(`!${src}`);
          }}
        />
      ) : null}
    </span>
  );
}
