/**
 * Encrypted env-var routes.
 *
 * Values are AES-256-GCM encrypted at rest and decrypted only at the moment
 * they are injected into a runtime container (see deployment-orchestrator.ts).
 * The list endpoint NEVER returns plaintext values; callers must fetch a
 * single var explicitly if they need to inspect it (and we still redact
 * secrets in those responses too).
 *
 * Per DEPLOX_SECURITY_ARCHITECTURE.md §8: secrets isolated between build and
 * runtime; build logs auto-redact secrets.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { envVars, projects } from '../db/schema.js';
import { requireAuth } from '../auth/middleware.js';
import { encrypt, decrypt } from '../services/encryption.js';
import type { EnvVar } from '@deplox/shared-types';

const KeySchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,62}$/, 'must be UPPER_SNAKE_CASE');

const PutEnvSchema = z.object({
  variables: z.array(
    z.object({
      key: KeySchema,
      value: z.string().max(8192),
      isSecret: z.boolean().optional(),
    }),
  ).min(1).max(100),
});

function toEnvVarPublic(row: typeof envVars.$inferSelect): EnvVar {
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    isSecret: row.isSecret,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return p ?? null;
}

export function registerEnvRoutes(app: FastifyInstance): void {
  /** GET /api/projects/:projectId/env — list var KEYS only (never values). */
  app.get('/api/projects/:projectId/env', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await loadOwnedProject(projectId, req.user!.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.select().from(envVars).where(eq(envVars.projectId, projectId));
    return rows.map(toEnvVarPublic);
  });

  /** GET /api/projects/:projectId/env/:key — single value (still redacted if isSecret). */
  app.get('/api/projects/:projectId/env/:key', async (req, reply) => {
    const { projectId, key } = req.params as { projectId: string; key: string };
    const project = await loadOwnedProject(projectId, req.user!.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });

    const [row] = await db
      .select()
      .from(envVars)
      .where(and(eq(envVars.projectId, projectId), eq(envVars.key, key)));
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const plain = decrypt(row.encryptedValue);
    return {
      ...toEnvVarPublic(row),
      value: row.isSecret ? '••••••••' : plain,
    };
  });

  /** PUT /api/projects/:projectId/env — bulk upsert. */
  app.put('/api/projects/:projectId/env', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const parsed = PutEnvSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_input', message: parsed.error.message });
    }
    const project = await loadOwnedProject(projectId, req.user!.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });

    for (const v of parsed.data.variables) {
      const encryptedValue = encrypt(v.value);
      const existing = await db
        .select()
        .from(envVars)
        .where(and(eq(envVars.projectId, projectId), eq(envVars.key, v.key)));
      if (existing[0]) {
        await db
          .update(envVars)
          .set({
            encryptedValue,
            isSecret: v.isSecret ?? true,
            updatedAt: new Date(),
          })
          .where(eq(envVars.id, existing[0].id));
      } else {
        await db.insert(envVars).values({
          projectId,
          key: v.key,
          encryptedValue,
          isSecret: v.isSecret ?? true,
        });
      }
    }
    return reply.send({ ok: true });
  });

  /** DELETE /api/projects/:projectId/env/:key */
  app.delete('/api/projects/:projectId/env/:key', async (req, reply) => {
    const { projectId, key } = req.params as { projectId: string; key: string };
    const project = await loadOwnedProject(projectId, req.user!.id);
    if (!project) return reply.code(404).send({ error: 'not_found' });
    await db
      .delete(envVars)
      .where(and(eq(envVars.projectId, projectId), eq(envVars.key, key)));
    return reply.code(204).send();
  });
}