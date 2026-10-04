/** Inline SVG icons. All are decorative; accessible names live on the controls that use them. */

interface IconProps {
  size?: number;
  class?: string;
}

function base(size: number | undefined, className?: string) {
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
    class: className,
  };
}

export function SearchIcon({ size, class: c }: IconProps) {
  return (
    <svg {...base(size, c)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  );
}

export function ChevronDownIcon({ size, class: c }: IconProps) {
  return (
    <svg {...base(size, c ?? 'chevron')}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ArrowRightIcon({ size, class: c }: IconProps) {
  return (
    <svg {...base(size, c)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function PaletteIcon({ size, class: c }: IconProps) {
  return (
    <svg {...base(size, c)}>
      <path d="M12 3a9 9 0 1 0 0 18h1.6a2.4 2.4 0 0 0 1.8-4 2.4 2.4 0 0 1 1.8-4H20a2 2 0 0 0 2-2c0-4.6-4.5-8-10-8Z" />
      <circle cx="7.5" cy="11.5" r="0.6" fill="currentColor" />
      <circle cx="10.5" cy="7.8" r="0.6" fill="currentColor" />
      <circle cx="15" cy="7.5" r="0.6" fill="currentColor" />
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

export function ExternalIcon({ size, class: c }: IconProps) {
  return (
    <svg {...base(size, c)}>
      <path d="M7 17 17 7M8 7h9v9" />
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

export function AlertIcon({ size, class: c }: IconProps) {
  return (
    <svg {...base(size, c)}>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v4m0 3.5v.5" />
    </svg>
  );
}

export function PlusIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function RefreshIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function GridIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </svg>
  );
}

export function PulseIcon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 12h4l2.5-6 5 12L17 12h4" />
    </svg>
  );
}

/** The AppWatch mark: a watch/radar ring with a sweep, in the brand blue. */
export function LogoIcon({ size = 26 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden class="logo">
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="8"
        fill="none"
        stroke="var(--logo-ring)"
        stroke-width="2"
      />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        fill="none"
        stroke="var(--logo-ring)"
        stroke-width="2"
        opacity="0.4"
      />
      <path
        class="logo__sweep"
        d="M16 7.5a8.5 8.5 0 0 1 8.5 8.5"
        fill="none"
        stroke="var(--logo-ring)"
        stroke-width="2.5"
        stroke-linecap="round"
      />
      <circle cx="16" cy="16" r="2.6" fill="var(--logo-ring)" />
    </svg>
  );
}

export function TranslateIcon({ size, class: c }: IconProps) {
  return (
    <svg {...base(size, c)}>
      <path d="M4 5h9M8.5 3v2M6 5c.6 3.4 2.9 6 6 7.5M11 5c-.8 3.6-3.4 6.5-7 8" />
      <path d="m12.5 21 4-10 4 10M14 17.5h5" />
    </svg>
  );
}
