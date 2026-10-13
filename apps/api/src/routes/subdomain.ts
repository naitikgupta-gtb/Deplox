/**
 * Picked-subdomain routes.
 *
 * Three endpoints, all scoped to the authenticated user:
 *
 *   POST   /api/projects/:id/subdomain/check   { subdomain }
 *     -> 200 { subdomain, available, reason, suggestion }
 *     Live availability check. Used by the NewProjectPage + ProjectPage
 *     UI to show "available" / "taken" as the user types.
 *
 *   POST   /api/projects/:id/subdomain/claim   { subdomain }
 *     -> 200 { subdomain, fullHostname, wasAlreadyYours, caddyRouteActive }
 *     Atomically validate + check + write. Re-registers the Caddy route
 *     against the currently-running deployment if one exists.
 *
 *   DELETE /api/projects/:id/subdomain
 *     -> 204 No Content
 *     Release the picked subdomain. The next deploy falls back to the
 *     auto-generated `<name>-<short-hash>.deplox.site`.
 *
 * See services/subdomain.ts for validation rules and the apex.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects } from '../db/schema.js';
import {
  AvailabilityResult,
  checkAvailability,
  claim,
  release,
} from '../services/subdomain.js';

const SubdomainSchema = z.object({
  subdomain: z.string().min(1).max(64),
});

async function loadOwnedProject(projectId: string, userId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return row ?? null;
}

function mapClaimErrorToHttp(err: Error): { status: number; body: unknown } | null {
  const msg = err.message;
  if (msg === 'project_not_found') {
    return { status: 404, body: { error: 'not_found' } };
  }
  if (msg === 'taken') {
    return { status: 409, body: { error: 'taken' } };
  }
  if (msg.startsWith('invalid_')) {
    return {
      status: 400,
      body: { error: msg.slice('invalid_'.length) },
    };
  }
  return null;
}

export function registerSubdomainRoutes(app: FastifyInstance): void {
  /**
   * POST /api/projects/:id/subdomain/check
   * Live availability check. Returns 200 in all cases (no throws) so the
   * UI can render the "available" / "taken" / "invalid" badge as the
   * user types.
   */
  app.post('/api/projects/:id/subdomain/check', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = SubdomainSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_input',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const project = await loadOwnedProject(id, req.user!.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });
    const result: AvailabilityResult = await checkAvailability(
      parsed.data.subdomain,
      id,
    );
    return result;
  });

  /**
   * POST /api/projects/:id/subdomain/claim
   * Atomically validate, check, and write. Re-registers the Caddy route.
   */
  app.post('/api/projects/:id/subdomain/claim', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = SubdomainSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_input',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const project = await loadOwnedProject(id, req.user!.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });
    try {
      const result = await claim(id, req.user!.id, parsed.data.subdomain);
      return result;
    } catch (err) {
      const mapped = mapClaimErrorToHttp(err as Error);
      if (mapped) return reply.code(mapped.status).send(mapped.body);
      throw err;
    }
  });

  /**
   * DELETE /api/projects/:id/subdomain
   * Release the picked subdomain. Falls back to auto-generation on next
   * deploy.
   */
  app.delete('/api/projects/:id/subdomain', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await loadOwnedProject(id, req.user!.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });
    try {
      const result = await release(id, req.user!.id);
      return result;
    } catch (err) {
      const mapped = mapClaimErrorToHttp(err as Error);
      if (mapped) return reply.code(mapped.status).send(mapped.body);
      throw err;
    }
  });
}
