/**
 * Lucide-style inline SVG icon set.
 *
 * All icons are 24×24 with stroke="currentColor", strokeWidth=1.6, round caps.
 * Add to this file as the UI grows.
 */

import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

function base({ size = 16, strokeWidth = 1.6, className, style }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
  };
}

export function IconExternalLink(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export function IconGithub(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function IconRocket(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

export function IconLock(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function IconZap(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function IconHistory(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

export function IconLogOut(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function IconPlus(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconRefresh(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M21 12a9 9 0 0 0-15-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

export function IconTerminal(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

export function IconX(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconCheck(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconLayers(props: IconProps): JSX.Element {
  return (
    <svg {...base(props)}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

// ===== framework icons =====
// Abstract monogram-style for each supported framework. Single-letter in a
// coloured tile. Keeps the "no fake logos" rule from DESIGN_RULES.md while
// still being instantly recognizable.

import type { Framework } from '@deplox/shared-types';

interface FrameworkIconProps extends IconProps {
  framework: Framework;
}

const FW_META: Record<Framework, { letter: string; bg: string; fg: string }> = {
  react:   { letter: 'R', bg: '#149eca', fg: '#ffffff' },
  nextjs:  { letter: 'N', bg: '#0a0a0a', fg: '#ffffff' },
  node:    { letter: 'N', bg: '#3c873a', fg: '#ffffff' },
  python:  { letter: 'Py', bg: '#3776ab', fg: '#ffd43b' },
  go:      { letter: 'Go', bg: '#00add8', fg: '#ffffff' },
  static:  { letter: 'S', bg: '#6b6b6b', fg: '#ffffff' },
};

export function FrameworkIcon({ framework, size = 14, ...rest }: FrameworkIconProps): JSX.Element {
  const meta = FW_META[framework];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={rest.className}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...rest.style }}
      role="img"
      aria-label={`${framework}`}
    >
      <rect width="16" height="16" rx="3" fill={meta.bg} />
      <text
        x="8" y="11.5"
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize={meta.letter.length > 1 ? '7' : '10'}
        fontWeight="700"
        fill={meta.fg}
      >
        {meta.letter}
      </text>
    </svg>
  );
}

export function FrameworkBadge({ framework }: { framework: Framework | null }): JSX.Element {
  if (!framework) return <span className="faint">—</span>;
  return (
    <span className="framework-badge">
      <FrameworkIcon framework={framework} size={12} /> {framework}
    </span>
  );
}