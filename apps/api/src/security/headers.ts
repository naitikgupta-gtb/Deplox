/**
 * Security headers — applied to every response (HTML, JSON, errors).
 *
 * Browsers only act on these for HTML responses, but sending them on JSON
 * too is harmless and prevents header stripping bugs in the reverse proxy
 * from accidentally downgrading the security posture.
 *
 * Headers covered:
 *   - Content-Security-Policy      XSS mitigation. Tight policy: same-origin
 *                                  scripts/styles, no inline scripts, no
 *                                  eval, no foreign framing.
 *   - Strict-Transport-Security    Force HTTPS for 2 years + subdomains +
 *                                  preload-eligible. The web origin (Caddy)
 *                                  also sets this, but we double up here.
 *   - X-Frame-Options              Legacy clickjacking defense; modern equiv
 *                                  is `frame-ancestors 'none'` in CSP.
 *   - X-Content-Type-Options       Block MIME-sniffing attacks.
 *   - Referrer-Policy             Don't leak URLs to third parties.
 *   - Permissions-Policy           Opt out of FLoC / Topics / sensors.
 *   - Cross-Origin-*               Defense in depth for Spectre-class.
 *
 * Per docs/SECURITY-AUDIT.md — applied to all responses including errors.
 */

/// <reference path="./fastify-augmentations.d.ts" />

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// `connect-src` permits same-origin + GitHub avatars (the web UI loads
// user avatars from avatars.githubusercontent.com) + the Resend API host
// (only relevant if the SPA ever calls Resend directly, which it doesn't
// today, but the directive is permissive enough for future needs).
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  // Vite injects inline styles in dev and a few framework CSS-in-JS paths
  // do too in prod. Tighten if we ever adopt nonce-based styles.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://avatars.githubusercontent.com https://api.github.com",
  "frame-ancestors 'none'",
  "form-action 'self' https://github.com",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'camera=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()',
  'interest-cohort=()', // opt out of FLoC
].join(', ');

function applySecurityHeaders(
  _req: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
  done: (err: Error | null, payload: unknown) => void,
): void {
  // `reply.header()` is idempotent — set-once-per-reply, last write wins.
  // Set every header unconditionally; the value of a few depends on the
  // request method.
  reply.header('Content-Security-Policy', CSP_DIRECTIVES);
  reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', PERMISSIONS_POLICY);
  reply.header('Cross-Origin-Opener-Policy', 'same-origin');
  reply.header('Cross-Origin-Resource-Policy', 'same-origin');
  reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
  done(null, payload);
}

/** Register the security-headers hook on the Fastify instance. */
export function registerSecurityHeaders(app: FastifyInstance): void {
  // onSend fires for every response (including errors from the error
  // handler), so this is the right hook. It runs after the body has been
  // serialized but before the response is flushed to the socket.
  app.addHook('onSend', applySecurityHeaders);
}
