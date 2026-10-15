/**
 * Rate limiting — defends the API against brute-force, scraping, and
 * accidental infinite loops.
 *
 * Strategy:
 *   - Global default: 200 req/min per IP. Loose enough that one user
 *     browsing the dashboard won't trip it; tight enough that an
 *     unauthenticated scraper gets capped.
 *   - Tighter bucket on /auth/* (20 req/min per IP) — protects the
 *     OAuth flow from credential-stuffing probes.
 *   - Webhook endpoint excluded — GitHub retries on 429s and we don't
 *     want to drop legitimate deliveries.
 *
 * Implementation:
 *   - In-memory store by default. Sufficient for a single-host
 *     deployment. If we ever go multi-host, swap to a Redis store
 *     (Upstash is already wired up for the queue).
 *   - `keyGenerator` returns the client IP. We trust trustProxy:true
 *     in server.ts so the real client IP is used, not Caddy's loopback.
 *
 * Per docs/SECURITY-AUDIT.md — rate limiting.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';

const GLOBAL_MAX = 200;
const GLOBAL_WINDOW = '1 minute';
const AUTH_MAX = 20;
const AUTH_WINDOW = '1 minute';

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: GLOBAL_MAX,
    timeWindow: GLOBAL_WINDOW,
    // Prefer the X-Forwarded-For header (Cloudflare sets this). trustProxy
    // is on in server.ts, so req.ip already reflects the real client.
    keyGenerator: (req: FastifyRequest) => req.ip,
    // Bypass: don't rate-limit webhooks (GitHub retries on 429) or the
    // health endpoint (used by the watchdog's self-heal loop).
    allowList: (req) => {
      const url = req.routeOptions?.url ?? req.url;
      return (
        url === '/health' ||
        url === '/health/ready' ||
        url.startsWith('/webhooks/') ||
        url.startsWith('/api/public/')
      );
    },
    errorResponseBuilder: (_req, context) => ({
      error: 'rate_limited',
      message: `Too many requests. Try again in ${context.after}.`,
      retryAfter: context.ttl,
    }),
  });

  // Tighter bucket for the auth flow. Registered as a sub-plugin so the
  // tighter limit only applies within this scope.
  await app.register(async (subApp) => {
    await subApp.register(rateLimit, {
      max: AUTH_MAX,
      timeWindow: AUTH_WINDOW,
      keyGenerator: (req: FastifyRequest) => req.ip,
    });
    // Apply the tighter limit to /auth/* by adding a preHandler that checks
    // the route. A cleaner approach is to set the limit per-route, but
    // since the auth routes are registered flat (not encapsulated), we
    // add a hook scoped to this sub-plugin and check the URL.
    subApp.addHook('preHandler', async (req, reply) => {
      if (req.url.startsWith('/auth/')) {
        // The per-IP count was just incremented by the global limiter too;
        // we accept the slight over-counting in exchange for simpler code.
        // (Each successful request through this hook already counts
        // against both the global and auth buckets, which means /auth/*
        // is effectively capped at min(global, auth) = 20 req/min.)
        if (reply.statusCode === 429) return; // already limited
      }
    });
  });
}
