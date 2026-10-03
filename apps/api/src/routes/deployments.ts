/**
 * Deployment routes — create, list, read, stop, rollback, and SSE log stream.
 *
 * Per DEPLOX_SECURITY_ARCHITECTURE.md §8 — all queries scoped by req.user.id
 * via project ownership. We never trust :deploymentId alone to imply auth.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deployments, projects } from '../db/schema.js';
import { requireAuth } from '../auth/middleware.js';
import { decrypt } from '../services/encryption.js';
import {
  rollbackDeployment,
  runDeployment,
  stopDeployment,
} from '../services/deployment-orchestrator.js';
import {
  getBufferedLogs,
  setStatus,
  appendLog,
  completeStream,
  subscribe,
} from '../services/log-streamer.js';
import type { Deployment, DeploymentStatus, LogStreamEvent } from '@deplox/shared-types';
import { fetchRepoMetadata } from '../services/github.js';
import { buildQueue } from '../queues/index.js';

const CreateDeploymentSchema = z.object({
  commitSha: z.string().regex(/^[a-f0-9]{7,64}$/i).optional(),
});

function toDeployment(row: typeof deployments.$inferSelect): Deployment {
  return {
    id: row.id,
    projectId: row.projectId,
    commitSha: row.commitSha,
    commitMessage: row.commitMessage,
    commitAuthor: row.commitAuthor,
    status: row.status as DeploymentStatus,
    framework: (row.framework as Deployment['framework']) ?? null,
    containerId: row.containerId,
    hostPort: row.hostPort,
    publicUrl: row.publicUrl,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

async function loadOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return p ?? null;
}

async function loadOwnedDeployment(deploymentId: string, userId: string) {
  const [row] = await db
    .select({
      deployment: deployments,
      project: projects,
    })
    .from(deployments)
    .innerJoin(projects, eq(projects.id, deployments.projectId))
    .where(and(eq(deployments.id, deploymentId), eq(projects.userId, userId)))
    .limit(1);
  return row ?? null;
}

export function registerDeploymentRoutes(app: FastifyInstance): void {
  /** GET /api/projects/:projectId/deployments */
  app.get('/api/projects/:projectId/deployments', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await loadOwnedProject(projectId, req.user!.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });
    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.projectId, projectId))
      .orderBy(desc(deployments.startedAt))
      .limit(50);
    return rows.map(toDeployment);
  });

  /** POST /api/projects/:projectId/deployments — enqueue a new deployment */
  app.post('/api/projects/:projectId/deployments', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const parsed = CreateDeploymentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_input', message: parsed.error.message });
    }
    const project = await loadOwnedProject(projectId, req.user!.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });

    let commitSha: string | undefined = parsed.data.commitSha;
    let commitMessage: string | null = null;
    let commitAuthor: string | null = null;
    if (!commitSha) {
      const userToken = req.user!.githubAccessTokenEncrypted
        ? decrypt(req.user!.githubAccessTokenEncrypted)
        : null;
      const meta = await fetchRepoMetadata(project.githubRepoFullName, userToken);
      commitSha = meta.latestCommitSha;
      commitMessage = meta.latestCommitMessage;
      commitAuthor = meta.latestCommitAuthor;
    }

    const [row] = await db
      .insert(deployments)
      .values({
        projectId,
        commitSha,
        commitMessage,
        commitAuthor,
        status: 'queued',
      })
      .returning();
    if (!row) return reply.code(500).send({ error: 'insert_failed' });

    // Enqueue the build. For mock mode we run inline; for prod the worker
    // process picks it up off BullMQ. The orchestrator itself is local in this
    // build, so we just kick it off directly here.
    void runDeployment(row.id).catch((err) => {
      req.log.error({ err, deploymentId: row.id }, 'deployment failed in background');
    });

    return reply.code(202).send(toDeployment(row));
  });

  /** GET /api/deployments/:id */
  app.get('/api/deployments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = await loadOwnedDeployment(id, req.user!.id);
    if (!found) return reply.code(404).send({ error: 'not_found' });
    return toDeployment(found.deployment);
  });

  /** POST /api/deployments/:id/stop */
  app.post('/api/deployments/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = await loadOwnedDeployment(id, req.user!.id);
    if (!found) return reply.code(404).send({ error: 'not_found' });
    if (found.deployment.status === 'stopped' || found.deployment.status === 'failed') {
      return reply.code(409).send({ error: 'already_terminal', status: found.deployment.status });
    }
    await stopDeployment(id);
    return reply.send({ ok: true });
  });

  /**
   * POST /api/deployments/:id/rollback
   * Body: { targetDeploymentId: string }
   */
  app.post('/api/deployments/:id/rollback', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ targetDeploymentId: z.string().uuid() }).safeParse(req.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid_input', message: body.error.message });
    }
    const found = await loadOwnedDeployment(id, req.user!.id);
    if (!found) return reply.code(404).send({ error: 'not_found' });

    try {
      const newId = await rollbackDeployment(found.deployment.projectId, body.data.targetDeploymentId);
      return reply.code(202).send({ newDeploymentId: newId });
    } catch (err) {
      const message = String((err as Error).message ?? err);
      return reply.code(409).send({ error: 'rollback_failed', message });
    }
  });

  /**
   * GET /api/deployments/:id/logs — Server-Sent Events stream.
   *
   * On connect we replay the in-memory log lines for this deployment, then
   * subscribe to new lines until the deployment reaches a terminal state.
   */
  app.get('/api/deployments/:id/logs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = await loadOwnedDeployment(id, req.user!.id);
    if (!found) return reply.code(404).send({ error: 'not_found' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let closed = false;
    const send = (event: LogStreamEvent) => {
      if (closed) return;
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Initial replay of any buffered lines.
    const buffer = getBufferedLogs(id);
    if (buffer.length === 0) {
      send({ type: 'status', status: found.deployment.status as DeploymentStatus, ts: new Date().toISOString() });
    }

    const unsubscribe = subscribe(id, {
      id: `sse-${Date.now()}`,
      send,
      close: () => {
        if (!closed) {
          closed = true;
          reply.raw.end();
        }
      },
    });

    // Keep-alive ping so proxies don't terminate the connection.
    const keepaliveTimer = setInterval(() => {
      if (closed) return;
      reply.raw.write(': ping\n\n');
    }, 15_000);

    req.raw.on('close', () => {
      closed = true;
      clearInterval(keepaliveTimer);
      unsubscribe();
    });
  });
}