/**
 * Custom-domain routes.
 *
 * Three endpoints, all scoped to the authenticated user:
 *
 *   POST   /api/projects/:id/custom-domain/start   { domain }
 *     -> 200 { domain, txtHost, txtValue, token, alreadyVerified }
 *     Generate a fresh verification token and store it. The user must
 *     publish the TXT record at <txtHost>, then call /verify.
 *
 *   POST   /api/projects/:id/custom-domain/verify
 *     -> 200 { status: 'verified' | 'pending' | 'no_challenge', ... }
 *     DNS lookup. If the stored token is present at the TXT host,
 *     mark the project verified AND register the Caddy route against
 *     the project's currently-running deployment (if any). If the
 *     project has no running deployment, the route registration is
 *     deferred to the next deploy (existing behavior in
 *     deployment-orchestrator.ts).
 *
 *   DELETE /api/projects/:id/custom-domain
 *     -> 204 No Content
 *     Unregister the Caddy route and clear the customDomain fields.
 *
 * The Caddy route registration lives in services/caddy.ts (used by the
 * deployment-orchestrator too). We only register a route AFTER the user
 * has proven ownership via the TXT record — see services/domain-verification.ts.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects, deployments } from '../db/schema.js';
import {
  checkVerification,
  clearCustomDomain,
  startVerification,
  type CheckResult,
} from '../services/domain-verification.js';
import {
  registerDomainRoute,
  unregisterDomainRoute,
} from '../services/caddy.js';

const StartSchema = z.object({
  domain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'must be a valid domain'),
});

async function loadOwnedProject(projectId: string, userId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return row ?? null;
}

async function registerRouteIfLive(projectId: string, domain: string): Promise<void> {
  // Find the most recent running deployment for this project and register
  // a Caddy route against its hostPort. If there's no running deployment,
  // we silently skip — the next deploy will pick up the domain and
  // register via the orchestrator.
  const [latest] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.projectId, projectId))
    .orderBy(desc(deployments.startedAt))
    .limit(50);
  const live = latest && latest.status === 'running' && latest.hostPort !== null
    ? latest
    : null;
  if (!live || live.hostPort === null) return;
  await registerDomainRoute(projectId, domain, live.hostPort);
}

export function registerCustomDomainRoutes(app: FastifyInstance): void {
  /**
   * POST /api/projects/:id/custom-domain/start
   * Begin (or refresh) the verification flow.
   */
  app.post(
    '/api/projects/:id/custom-domain/start',
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = StartSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_input',
          message: parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        });
      }
      const project = await loadOwnedProject(id, req.user!.id);
      if (!project) return reply.code(404).send({ error: 'not_found' });

      try {
        const result = await startVerification({
          projectId: id,
          userId: req.user!.id,
          domain: parsed.data.domain.toLowerCase(),
        });
        return result;
      } catch (err) {
        const msg = (err as Error).message ?? 'unknown';
        if (msg === 'invalid_domain') {
          return reply.code(400).send({ error: 'invalid_domain' });
        }
        if (msg === 'project_not_found') {
          return reply.code(404).send({ error: 'not_found' });
        }
        throw err;
      }
    },
  );

  /**
   * POST /api/projects/:id/custom-domain/verify
   * Check the DNS TXT record. If it matches, register the Caddy route.
   */
  app.post(
    '/api/projects/:id/custom-domain/verify',
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const project = await loadOwnedProject(id, req.user!.id);
      if (!project) return reply.code(404).send({ error: 'not_found' });

      let result: CheckResult;
      try {
        result = await checkVerification(id, req.user!.id);
      } catch (err) {
        const msg = (err as Error).message ?? 'unknown';
        if (msg === 'project_not_found') {
          return reply.code(404).send({ error: 'not_found' });
        }
        throw err;
      }

      if (result.status === 'verified') {
        // Best-effort Caddy route registration. Failures here are
        // non-fatal — the next deploy will retry.
        try {
          await registerRouteIfLive(id, result.domain);
        } catch {
          /* log but don't fail the verification response */
        }
      }

      return result;
    },
  );

  /**
   * DELETE /api/projects/:id/custom-domain
   * Remove the custom domain, unregister the Caddy route.
   */
  app.delete(
    '/api/projects/:id/custom-domain',
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const project = await loadOwnedProject(id, req.user!.id);
      if (!project) return reply.code(404).send({ error: 'not_found' });

      const { previousDomain } = await clearCustomDomain(id, req.user!.id);
      if (previousDomain) {
        // Fire-and-forget — the DB is the source of truth.
        unregisterDomainRoute(id).catch(() => undefined);
      }
      return reply.code(204).send();
    },
  );
}
