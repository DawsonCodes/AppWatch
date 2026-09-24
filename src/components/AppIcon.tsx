import { useState } from 'preact/hooks';

interface AppIconProps {
  name: string;
  iconUrl: string | null;
  size: number;
  class?: string;
  /** Optional View Transition name (used for the card → detail morph). */
  vtName?: string;
}

/**
 * App icon with a local fallback: when the store CDN icon is missing or fails
 * to load, a monogram tile is shown instead so broken images never appear.
 */
export function AppIcon({ name, iconUrl, size, class: className = '', vtName }: AppIconProps) {
  const [failed, setFailed] = useState(false);
  const style = vtName ? { viewTransitionName: vtName } : undefined;

  if (!iconUrl || failed) {
    return (
      <span
        class={`app-icon app-icon--fallback ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.42, ...style }}
        aria-hidden="true"
      >
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }

  return (
    <img
      class={`app-icon ${className}`}
      src={iconUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
