// One-off logo generator for DEPLOX.
//
// Renders the deplox brand mark (three stacked rounded squares) at every
// size we need across the web app:
//
//   apps/web/public/apple-touch-icon.png   180 x 180  (iOS home screen)
//   apps/web/public/icon-192.png           192 x 192  (PWA, Android)
//   apps/web/public/icon-512.png           512 x 512  (PWA splash, Android)
//   apps/web/public/deplox-logo.png        460 x 460  (GitHub OAuth app icon)
//
// The 460x460 square is the size GitHub recommends for OAuth app logos.
// Upload at: github.com/settings/developers (OAuth apps → DEPLOX).
//
// Run from repo root:  node scripts/make-deplox-logo.cjs

const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');

// Dark-mode-first brand mark. White on near-black (#0a0a0a) — matches the
// favicon.svg and the deplox site background. No gradients, no purple.
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="12" fill="#0a0a0a"/>
  <rect x="8" y="40" width="36" height="16" rx="4" fill="#fafafa" opacity="0.35"/>
  <rect x="14" y="24" width="36" height="16" rx="4" fill="#fafafa" opacity="0.65"/>
  <rect x="20" y="8" width="36" height="16" rx="4" fill="#fafafa" opacity="1"/>
</svg>`;

const targets = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png',         size: 192 },
  { file: 'icon-512.png',         size: 512 },
  { file: 'deplox-logo.png',      size: 460 },
];

(async () => {
  const outDir = path.join(__dirname, '..', 'apps', 'web', 'public');
  fs.mkdirSync(outDir, { recursive: true });
  const buf = Buffer.from(svg);
  for (const { file, size } of targets) {
    const out = path.join(outDir, file);
    await sharp(buf).resize(size, size).png().toFile(out);
    const stat = fs.statSync(out);
    console.log(`wrote ${path.relative(process.cwd(), out)}  ${size}x${size}  ${stat.size} bytes`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});