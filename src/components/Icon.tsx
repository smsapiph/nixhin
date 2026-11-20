import type { ReactElement } from 'react';

interface IconDef {
  readonly variant: 'stroke' | 'fill';
  readonly body: ReactElement;
}

const ICONS = {
  search: {
    variant: 'stroke',
    body: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </>
    ),
  },
  menu: { variant: 'stroke', body: <path d="M5 9h14M5 15h14" /> },
  close: { variant: 'stroke', body: <path d="M6 6l12 12M18 6L6 18" /> },
  play: { variant: 'fill', body: <path d="M7 4.5v15l13-7.5z" /> },
  bigPlay: { variant: 'fill', body: <path d="M8 5v14l11-7z" /> },
  pause: {
    variant: 'fill',
    body: (
      <>
        <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
        <rect x="14" y="5" width="3.5" height="14" rx="1" />
      </>
    ),
  },
  back: { variant: 'stroke', body: <path d="M15 5l-7 7 7 7" /> },
  next: { variant: 'fill', body: <path d="M5 5v14l10-7zM17 5h2.5v14H17z" /> },
  subtitles: {
    variant: 'stroke',
    body: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3" />
      </>
    ),
  },
  fullscreen: { variant: 'stroke', body: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /> },
  home: { variant: 'stroke', body: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /> },
  grid: {
    variant: 'stroke',
    body: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  calendar: {
    variant: 'stroke',
    body: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M9 3v4M15 3v4" />
      </>
    ),
  },
  bookmark: { variant: 'stroke', body: <path d="M6 4h12v16l-6-4-6 4z" /> },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  readonly name: IconName;
  /** CSS length; defaults to 1.1em. */
  readonly size?: string;
}

/** Decorative icon. Always pair with visible text or an aria-label on the parent control. */
export function Icon({ name, size = '1.1em' }: IconProps) {
  const { variant, body }: IconDef = ICONS[name];
  const paint =
    variant === 'stroke'
      ? {
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
        }
      : { fill: 'currentColor' };

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      style={{ width: size, height: size, flex: '0 0 auto' }}
      {...paint}
    >
      {body}
    </svg>
  );
}
