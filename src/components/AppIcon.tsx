import { useState } from 'preact/hooks';

interface AppIconProps {
  name: string;
  iconUrl: string | null;
  size: number;
  class?: string;
}

/**
 * App icon with a local fallback: when the store CDN icon is missing or fails
 * to load, a monogram tile is shown instead so broken images never appear.
 */
export function AppIcon({ name, iconUrl, size, class: className = '' }: AppIconProps) {
  const [failed, setFailed] = useState(false);

  if (!iconUrl || failed) {
    return (
      <span
        class={`app-icon app-icon--fallback ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
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
      onError={() => setFailed(true)}
    />
  );
}
