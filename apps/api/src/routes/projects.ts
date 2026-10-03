/**
 * Project routes — CRUD over the `projects` table.
 *
 * All routes require auth and scope every query by `req.user.id`.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects, deployments } from '../db/schema.js';
import { requireAuth } from '../auth/middleware.js';
import { fetchRepoMetadata } from '../services/github.js';
import { encrypt } from '../services/encryption.js';
import { loadConfig } from '@deplox/shared-config';
import type { Project } from '@deplox/shared-types';
import { decrypt } from '../services/encryption.js';

const cfg = loadConfig();

const CreateProjectSchema = z.object({
  githubRepoFullName: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, 'must be like "owner/repo"'),
  name: z.string().min(1).max(60).optional(),
  customDomain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'must be a valid domain')
    .optional(),
});

const UpdateProjectSchema = z.object({
  autoDeploy: z.boolean().optional(),
  customDomain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'must be a valid domain')
    .nullable()
    .optional(),
});

/** Generates a 32-byte webhook secret, returned as hex (64 chars). */
function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    githubRepoFullName: row.githubRepoFullName,
    githubRepoUrl: row.githubRepoUrl,
    defaultBranch: row.defaultBranch,
    framework: (row.framework as Project['framework']) ?? null,
    customDomain: row.customDomain,
    autoDeploy: row.autoDeploy,
    webhookConfigured: row.webhookSecret !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function registerProjectRoutes(app: FastifyInstance): void {
  /** GET /api/projects — list current user's projects */
  app.get('/api/projects', async (req) => {
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, req.user!.id));
    return rows.map(toProject);
  });

  /** POST /api/projects — register a new repo */
  app.post('/api/projects', async (req, reply) => {
    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_input',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    const { githubRepoFullName, name, customDomain } = parsed.data;

    // Use the user's stored OAuth token (if any) so we hit GitHub's 5000/hr
    // authenticated rate limit instead of 60/hr anonymous.
    const accessToken = req.user!.githubAccessTokenEncrypted
      ? decrypt(req.user!.githubAccessTokenEncrypted)
      : null;

    let meta;
    try {
      meta = await fetchRepoMetadata(githubRepoFullName, accessToken);
    } catch (err) {
      const message = String((err as Error).message ?? err);
      req.log.warn({ err, githubRepoFullName }, 'repo metadata fetch failed');
      return reply.code(404).send({
        error: 'repo_not_accessible',
        message: `Cannot access "${githubRepoFullName}". ${message}`,
      });
    }

    const [row] = await db
      .insert(projects)
      .values({
        userId: req.user!.id,
        name: name ?? githubRepoFullName.split('/')[1] ?? githubRepoFullName,
        githubRepoFullName,
        githubRepoUrl: `https://github.com/${githubRepoFullName}`,
        githubAccessTokenEncrypted: accessToken ? encrypt(accessToken) : null,
        defaultBranch: meta.defaultBranch,
        customDomain: customDomain ?? null,
        // Auto-issue a webhook secret so users can plug-and-play with GitHub.
        // The secret is only returned ONCE via the dedicated endpoint below.
        webhookSecret: generateWebhookSecret(),
      })
      .returning();
    if (!row) return reply.code(500).send({ error: 'insert_failed' });
    return reply.code(201).send(toProject(row));
  });

  /**
   * GET /api/projects/:id/webhook — returns the per-project webhook URL and
   * the secret (only endpoint that ever reveals the secret). Use this when
   * wiring up the webhook in repo settings.
   */
  app.get('/api/projects/:id/webhook', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, req.user!.id)));
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const webhookUrl = `${cfg.DEPLOX_PUBLIC_URL}/webhooks/github/${row.id}`;
    return {
      url: webhookUrl,
      secret: row.webhookSecret, // only place the secret is ever returned
      contentType: 'application/json',
      events: ['push'],
    };
  });

  /** POST /api/projects/:id/webhook/rotate — generates a new secret. */
  app.post('/api/projects/:id/webhook/rotate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(projects)
      .set({ webhookSecret: generateWebhookSecret(), updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, req.user!.id)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return {
      url: `${cfg.DEPLOX_PUBLIC_URL}/webhooks/github/${row.id}`,
      secret: row.webhookSecret,
      contentType: 'application/json',
      events: ['push'],
    };
  });

  /** PATCH /api/projects/:id — update auto-deploy / custom-domain settings. */
  app.patch('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateProjectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_input',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    const update: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.autoDeploy !== undefined) update.autoDeploy = parsed.data.autoDeploy;
    if (parsed.data.customDomain !== undefined) update.customDomain = parsed.data.customDomain;
    const [row] = await db
      .update(projects)
      .set(update)
      .where(and(eq(projects.id, id), eq(projects.userId, req.user!.id)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return toProject(row);
  });

  /** GET /api/projects/:id */
  app.get('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, req.user!.id)));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return toProject(row);
  });

  /** DELETE /api/projects/:id — also stops all running deployments. */
  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, req.user!.id)));
    if (!row) return reply.code(404).send({ error: 'not_found' });

    // Stop running deployments.
    const running = await db
      .select()
      .from(deployments)
      .where(eq(deployments.projectId, id));
    const { stopDeployment } = await import('../services/deployment-orchestrator.js');
    for (const d of running) {
      if (d.status === 'running' || d.status === 'starting') {
        try { await stopDeployment(d.id); } catch { /* ignore */ }
      }
    }

    await db.delete(projects).where(eq(projects.id, id));
    return reply.code(204).send();
  });
}