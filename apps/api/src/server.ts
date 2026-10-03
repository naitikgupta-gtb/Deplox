/**
 * Fastify server bootstrap.
 *
 * Wires up:
 *   - cookie + cors plugins
 *   - global error handler
 *   - request-scoped user attachment (attachUser)
 *   - all route modules
 *
 * Per DEPLOX_DESIGN_RULES.md §9 — keep endpoints boring and predictable.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { loadConfig } from '@deplox/shared-config';
import { getLogger } from '@deplox/shared-logger';
import { attachUser, requireAuth } from './auth/middleware.js';
import { registerAuthRoutes } from './auth/github.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerUserRoutes } from './routes/users.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerDeploymentRoutes } from './routes/deployments.js';
import { registerEnvRoutes } from './routes/env.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { primePortCache } from './services/port-allocator.js';
import { primeCaddyRoutes } from './services/caddy.js';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';

export async function buildServer(): Promise<FastifyInstance> {
  const cfg = loadConfig();
  // Fastify accepts a Pino-compatible logger; cast to its expected interface.
  const logger = getLogger() as unknown as FastifyBaseLogger;
  const app = Fastify({
    logger,
    bodyLimit: 1024 * 1024, // 1 MB
    trustProxy: true,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow any localhost in dev; tighten in prod via DEPLOX_PUBLIC_URL.
      if (!origin || origin.startsWith('http://localhost') || origin === cfg.DEPLOX_PUBLIC_URL) {
        cb(null, true);
      } else {
        cb(new Error(`CORS denied for ${origin}`), false);
      }
    },
    credentials: true,
  });
  await app.register(cookie);
  await app.register(sensible);

  // Capture raw request bodies for routes that verify HMAC (e.g. webhooks).
  // Stash the raw bytes on req.rawBody; Fastify's normal JSON parser still
  // populates req.body. Without this, we'd lose the bytes needed to compute
  // the X-Hub-Signature-256 HMAC against the *exact* body GitHub sent.
  //
  // We don't throw on invalid JSON here — webhooks may receive payloads we
  // want to handle gracefully (e.g. returning a 400 rather than a 500).
  // Routes that need a parsed JSON body should re-parse from req.rawBody.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req: FastifyRequest, body: Buffer, done) => {
      (req as { rawBody?: Buffer }).rawBody = body;
      if (body.length === 0) return done(null, null);
      try {
        const json = JSON.parse(body.toString('utf8'));
        done(null, json);
      } catch {
        // Defer the parse error to the route so it can return a clean 400
        // with a stable shape, instead of bubbling a 500 from the parser.
        done(null, { __deploxInvalidJson: true });
      }
    },
  );

  // Attach the user (if any) on every request before routes run.
  app.addHook('preHandler', attachUser);

  // ---- Public routes (no auth) ----------------------------------------
  // These must be registered at the root context because Fastify's
  // `addHook` applies to the whole encapsulation tree. We put them in a
  // sibling sub-plugin so the auth hook below doesn't reach them.
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerWebhookRoutes(app);

  // ---- Authenticated routes --------------------------------------------
  // Wrapped in their own sub-plugin so `requireAuth` only fires for these.
  await app.register(async (subApp) => {
    subApp.addHook('preHandler', requireAuth);
    registerUserRoutes(subApp);
    registerProjectRoutes(subApp);
    registerDeploymentRoutes(subApp);
    registerEnvRoutes(subApp);
  });

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'request failed');
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.code(status).send({
      error: (err as { code?: string }).code ?? 'internal_error',
      message: status >= 500 ? 'Internal error' : err.message,
    });
  });

  // Prime port cache from DB.
  try { await primePortCache(); } catch (err) { app.log.warn({ err }, 'port cache priming failed'); }

  // Re-register Caddy routes for any running deployments. This restores the
  // reverse-proxy mapping after an API restart — without it, custom domains
  // would 502 until the next deploy.
  try { await primeCaddyRoutes(); } catch (err) { app.log.warn({ err }, 'caddy route priming failed'); }

  return app;
}