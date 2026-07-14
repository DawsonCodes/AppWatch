/** Inline SVG icons. All are decorative; accessible names live on the controls that use them. */

interface IconProps {
  size?: number;
}

function base(size: number | undefined) {
  return {
    width: size ?? 16,
    height: size ?? 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round' as const,
    'stroke-linejoin': 'round' as const,
    'aria-hidden': true,
  };
}

export function SearchIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  );
}

export function SunIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  );
}

export function MoonIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

export function GitHubIcon({ size }: IconProps) {
  return (
    <svg width={size ?? 16} height={size ?? 16} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function StarIcon({ size, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}>
      <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9Z" />
    </svg>
  );
}

export function ExternalIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function CloseIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function CopyIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CheckIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  );
}

export function AlertIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v4m0 3.5v.5" />
    </svg>
  );
}

/** The AppWatch logo: a radar ring with a scanning pulse. Original artwork. */
export function LogoIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="aw-logo-grad" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stop-color="#38d6f5" />
          <stop offset="1" stop-color="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill="none"
        stroke="url(#aw-logo-grad)"
        stroke-width="2"
      />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        fill="none"
        stroke="url(#aw-logo-grad)"
        stroke-width="2"
        opacity="0.55"
      />
      <path
        d="M16 7.5a8.5 8.5 0 0 1 8.5 8.5"
        fill="none"
        stroke="url(#aw-logo-grad)"
        stroke-width="2.5"
      />
      <circle cx="16" cy="16" r="2.6" fill="url(#aw-logo-grad)" />
    </svg>
  );
}
