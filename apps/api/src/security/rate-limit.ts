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
 *   - Global limiter: @fastify/rate-limit (in-memory store, fine for
 *     single-host; swap to Redis for multi-host).
 *   - /auth/* limiter: hand-rolled in onRequest hook because the
 *     auth routes are registered flat on the main app (not in an
 *     encapsulated sub-plugin), so per-route plugin config is the
 *     only way to override the global limit. The preHandler-based
 *     approach we tried first didn't fire because no route was
 *     inside the sub-app. This is more direct.
 *
 * Per docs/SECURITY-AUDIT.md — rate limiting.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';

const GLOBAL_MAX = 200;
const GLOBAL_WINDOW = '1 minute';
const AUTH_MAX = 20;
const AUTH_WINDOW_MS = 60 * 1000;

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: GLOBAL_MAX,
    timeWindow: GLOBAL_WINDOW,
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

  // Tighter bucket for /auth/* — independent counter from the global
  // limiter. The onRequest hook fires before any other hook, so this
  // check happens even before auth/route resolution.
  const authHits = new Map<string, { count: number; resetAt: number }>();
  const authPathRe = /^\/auth\//;
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!authPathRe.test(req.url)) return;
    const ip = req.ip;
    const now = Date.now();
    const entry = authHits.get(ip);
    if (!entry || entry.resetAt < now) {
      authHits.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
      return;
    }
    entry.count++;
    if (entry.count > AUTH_MAX) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      reply
        .header('Retry-After', String(retryAfter))
        .code(429)
        .send({
          error: 'rate_limited',
          message: `Too many auth attempts. Try again in ${retryAfter}s.`,
        });
    }
  });
}
