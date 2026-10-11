/**
 * Deplox brand mark.
 *
 * Three rounded diamonds (rotated squares) stacked vertically:
 *   bottom (dim, lowest)   = your repo / source code
 *   middle (mid, centered) = the build
 *   top    (full, highest) = the live HTTPS URL
 *
 * Strictly monochromatic — uses currentColor so it adapts to the surrounding
 * text color (white in dark mode, black in light mode). No gradients, no
 * shadows, no purple. Matches the "Lucide-style SVG only" design rule.
 *
 * Variants:
 *   <Logo />                       — icon only at 22px (NavBar default)
 *   <Logo size={64} />             — icon only at any size
 *   <Logo variant="lockup" tagline />  — icon + wordmark + tagline
 */

export type LogoVariant = 'icon' | 'lockup';

export interface LogoProps {
  size?: number;
  variant?: LogoVariant;
  tagline?: boolean;
  title?: string;
  className?: string;
}

const ICON_VIEW = 32;
// Each diamond is a 14x14 rect rotated 45° around its own center.
// Centers are at (16, 20), (16, 16), (16, 12) — bottom, middle, top —
// spaced 4px apart vertically. The rect's rx gives the rounded corners
// that survive the rotation (Lucide-style).
const RECT_SIZE = 14;
const RECT_RX = 2.5;
const TOP_Y = 5;     // top diamond's unrotated top-left
const MID_Y = 9;
const BOT_Y = 13;
const CENTER_X = 16;
const RECT_X = CENTER_X - RECT_SIZE / 2;

function MarkSvg({
  size,
  labelled,
  title,
  className,
}: {
  size: number;
  labelled: boolean;
  title: string;
  className?: string | undefined;
}): JSX.Element {
  return (
    <svg
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_VIEW} ${ICON_VIEW}`}
      fill="currentColor"
      stroke="none"
      className={className}
    >
      {/* bottom diamond — your repo (dim) */}
      <rect
        x={RECT_X} y={BOT_Y}
        width={RECT_SIZE} height={RECT_SIZE}
        rx={RECT_RX}
        transform={`rotate(45 ${CENTER_X} ${BOT_Y + RECT_SIZE / 2})`}
        opacity={0.3}
      />
      {/* middle diamond — the build (mid) */}
      <rect
        x={RECT_X} y={MID_Y}
        width={RECT_SIZE} height={RECT_SIZE}
        rx={RECT_RX}
        transform={`rotate(45 ${CENTER_X} ${MID_Y + RECT_SIZE / 2})`}
        opacity={0.6}
      />
      {/* top diamond — live URL (full) */}
      <rect
        x={RECT_X} y={TOP_Y}
        width={RECT_SIZE} height={RECT_SIZE}
        rx={RECT_RX}
        transform={`rotate(45 ${CENTER_X} ${TOP_Y + RECT_SIZE / 2})`}
        opacity={1}
      />
    </svg>
  );
}

export function Logo({
  size = 22,
  variant = 'icon',
  tagline = false,
  title = 'deplox',
  className,
}: LogoProps): JSX.Element {
  if (variant === 'icon') {
    return <MarkSvg size={size} labelled={true} title={title} className={className} />;
  }

  // Lockup: icon + wordmark (+ optional tagline)
  const iconSize = size;
  const gap = Math.round(size * 0.5);
  const wordmarkSize = Math.round(size * 1.05);
  const taglineSize = Math.max(10, Math.round(size * 0.42));
  const taglineGap = Math.max(4, Math.round(size * 0.28));

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        lineHeight: 1,
        color: 'currentColor',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
        <MarkSvg size={iconSize} labelled={false} title={title} />
        <span
          style={{
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontWeight: 600,
            fontSize: wordmarkSize,
            letterSpacing: '-0.04em',
            color: 'currentColor',
          }}
        >
          deplox
        </span>
      </span>
      {tagline ? (
        <span
          style={{
            marginTop: taglineGap,
            marginLeft: iconSize + gap,
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontWeight: 500,
            fontSize: taglineSize,
            letterSpacing: '0.18em',
            color: 'currentColor',
            opacity: 0.55,
          }}
        >
          DEPLOY · BUILD · SCALE
        </span>
      ) : null}
    </span>
  );
}