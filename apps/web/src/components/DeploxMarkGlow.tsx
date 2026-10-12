/**
 * DeploxMarkGlow — the Deplox mark wrapped in a soft, breathing radial glow.
 *
 * Two layers:
 *   1. An absolutely-positioned radial gradient behind the mark that pulses
 *      slowly via CSS animation. The glow color follows the foreground so
 *      it works in both light and dark themes without hard-coding rgba.
 *   2. The crisp Lucide-style 3-diamond mark itself.
 *
 * No SVG filters (no feGaussianBlur); the glow is a pure CSS radial-gradient
 * so it stays crisp on retina and doesn't add an expensive paint.
 *
 * Per docs/DESIGN_RULES.md: monochromatic, no purple, no emoji.
 */

export interface DeploxMarkGlowProps {
  size?: number;
  className?: string;
  title?: string;
}

const ICON_VIEW = 32;
const RECT_SIZE = 14;
const RECT_RX = 2.5;
const TOP_Y = 5;
const MID_Y = 9;
const BOT_Y = 13;
const CENTER_X = 16;
const RECT_X = CENTER_X - RECT_SIZE / 2;

export function DeploxMarkGlow({
  size = 28,
  className,
  title = 'deplox',
}: DeploxMarkGlowProps): JSX.Element {
  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
      }}
      aria-hidden={title === 'deplox' ? true : undefined}
      role={title === 'deplox' ? undefined : 'img'}
      aria-label={title === 'deplox' ? undefined : title}
    >
      {/* Glow layer — pure CSS radial gradient, breathes via animation. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 50% 55%, currentColor 0%, transparent 62%)',
          opacity: 0.18,
          animation: 'deplox-mark-breathe 3.2s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      {/* Mark */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${ICON_VIEW} ${ICON_VIEW}`}
        fill="currentColor"
        stroke="none"
        style={{ position: 'relative', display: 'block' }}
      >
        <rect
          x={RECT_X} y={BOT_Y}
          width={RECT_SIZE} height={RECT_SIZE}
          rx={RECT_RX}
          transform={`rotate(45 ${CENTER_X} ${BOT_Y + RECT_SIZE / 2})`}
          opacity={0.3}
        />
        <rect
          x={RECT_X} y={MID_Y}
          width={RECT_SIZE} height={RECT_SIZE}
          rx={RECT_RX}
          transform={`rotate(45 ${CENTER_X} ${MID_Y + RECT_SIZE / 2})`}
          opacity={0.6}
        />
        <rect
          x={RECT_X} y={TOP_Y}
          width={RECT_SIZE} height={RECT_SIZE}
          rx={RECT_RX}
          transform={`rotate(45 ${CENTER_X} ${TOP_Y + RECT_SIZE / 2})`}
          opacity={1}
        />
      </svg>
    </span>
  );
}
