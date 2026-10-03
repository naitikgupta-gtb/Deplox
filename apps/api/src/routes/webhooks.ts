/**
 * GitHub webhook receiver.
 *
 * Public endpoint: `POST /webhooks/github/:projectId`.
 *
 * Per DEPLOX_IDEA.md §4 — auto-deploys on push to default branch. We verify
 * GitHub's `X-Hub-Signature-256` HMAC against the project's stored secret
 * (or a configured fallback secret) before doing anything else.
 *
 * Per DEPLOX_SECURITY_ARCHITECTURE.md — never trust the request body without
 * verifying the signature. Always validate the project id exists and that
 * the push actually targets the configured default branch (so PR-fork pushes
 * don't accidentally deploy private code from contributors).
 */

import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects, deployments } from '../db/schema.js';
import { runDeployment } from '../services/deployment-orchestrator.js';
import { loadConfig } from '@deplox/shared-config';
import { childLogger } from '@deplox/shared-logger';

const cfg = loadConfig();
const log = childLogger({ component: 'webhooks' });

// =============================================================================
// Signature verification
// =============================================================================

/**
 * Verifies GitHub's `X-Hub-Signature-256` header against the raw request body
 * using HMAC-SHA256. Performs a constant-time comparison to defeat timing
 * side-channels. Returns true on match.
 *
 * GitHub sends: `sha256=<lowercase hex of HMAC of the body using the secret>`.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;
  const provided = signatureHeader.slice('sha256='.length);
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

// =============================================================================
// Payload shape (we only read fields we need)
// =============================================================================

interface PushPayload {
  readonly ref?: string;
  readonly after?: string;
  readonly head_commit?: {
    readonly id?: string;
    readonly message?: string;
    readonly author?: { readonly name?: string; readonly email?: string };
  };
  readonly repository?: { readonly full_name?: string };
}

function isPushPayload(value: unknown): value is PushPayload {
  return typeof value === 'object' && value !== null;
}

// =============================================================================
// Route registration
// =============================================================================

export function registerWebhookRoutes(app: FastifyInstance): void {
  /**
   * POST /webhooks/github/:projectId
   *
   * Accepts GitHub `push` events. Verifies signature against the project's
   * webhook_secret (or fallback env secret), filters by ref (only the default
   * branch), and enqueues a deployment.
   *
   * Responds fast (202 Accepted) so GitHub doesn't retry on long builds.
   */
  app.post(
    '/webhooks/github/:projectId',
    {
      // Disable Fastify's default JSON body parsing — we need the raw bytes
      // to compute the HMAC. Parsed payload is decoded after verification.
      config: { rawBody: true },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
        return reply.code(400).send({ error: 'invalid_project_id' });
      }

      // -- Resolve project + secret --------------------------------------
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) {
        // Don't reveal whether the project exists; GitHub will retry and
        // eventually give up — same posture as a 404 from a private endpoint.
        return reply.code(404).send({ error: 'not_found' });
      }

      const secret = project.webhookSecret ?? cfg.DEPLOX_WEBHOOK_HMAC_FALLBACK_SECRET;
      if (!secret) {
        log.warn({ projectId }, 'webhook received but no secret configured; rejecting');
        return reply.code(503).send({
          error: 'webhook_not_configured',
          message: 'No webhook secret configured for this project.',
        });
      }

      // -- Verify HMAC ---------------------------------------------------
      const rawBody = (req as { rawBody?: Buffer }).rawBody;
      // Fastify types headers as possibly string[]; GitHub always sends a single value.
      const sigHeader = req.headers['x-hub-signature-256'];
      const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      if (!rawBody || !verifyWebhookSignature(rawBody, signature, secret)) {
        log.warn(
          { projectId, hasSig: Boolean(signature) },
          'webhook signature verification failed',
        );
        return reply.code(401).send({ error: 'invalid_signature' });
      }

      // -- Parse + filter -----------------------------------------------
      // The content-type parser stashes a marker object on req.body when the
      // body wasn't valid JSON — we re-parse from rawBody and return a 400.
      if (
        typeof req.body === 'object' &&
        req.body !== null &&
        (req.body as { __deploxInvalidJson?: boolean }).__deploxInvalidJson
      ) {
        return reply.code(400).send({ error: 'invalid_json' });
      }
      const payload = req.body;
      if (!isPushPayload(payload)) {
        return reply.code(400).send({ error: 'invalid_payload' });
      }

      // GitHub ref looks like "refs/heads/main" — we only auto-deploy the
      // configured default branch to avoid surprising the user with branch
      // deploys they didn't ask for.
      const expectedRef = `refs/heads/${project.defaultBranch}`;
      if (payload.ref !== expectedRef) {
        log.info(
          { projectId, ref: payload.ref, expected: expectedRef },
          'webhook ref does not match default branch; ignoring',
        );
        return reply.code(202).send({ ok: true, ignored: 'non_default_branch' });
      }

      // -- Insert deployment row ----------------------------------------
      const sha = payload.after ?? payload.head_commit?.id ?? '';
      if (!sha || !/^[a-f0-9]{7,64}$/i.test(sha)) {
        return reply.code(400).send({ error: 'missing_or_invalid_sha' });
      }
      const message = payload.head_commit?.message?.split('\n')[0] ?? null;
      const author =
        payload.head_commit?.author?.name ?? payload.head_commit?.author?.email ?? null;

      const [row] = await db
        .insert(deployments)
        .values({
          projectId,
          commitSha: sha,
          commitMessage: message,
          commitAuthor: author,
          status: 'queued',
        })
        .returning();
      if (!row) {
        return reply.code(500).send({ error: 'insert_failed' });
      }

      log.info(
        { projectId, deploymentId: row.id, sha: sha.slice(0, 7) },
        'auto-deploy triggered by webhook',
      );

      // -- Kick off the deployment in the background ---------------------
      // We respond first so GitHub gets a fast 202; deployment work runs
      // detached. If it fails, the deployment row reflects the failure
      // status — the user sees it on the project dashboard.
      if (project.autoDeploy) {
        void runDeployment(row.id).catch((err) => {
          log.error(
            { err, deploymentId: row.id },
            'auto-deploy failed in background',
          );
        });
      } else {
        log.info(
          { projectId },
          'auto_deploy disabled; deployment queued but not started',
        );
      }

      return reply.code(202).send({ ok: true, deploymentId: row.id });
    },
  );

  /**
   * GET /webhooks/github/:projectId — health-check for the endpoint (so users
   * can curl it after registering).
   */
  app.get('/webhooks/github/:projectId', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
      return reply.code(400).send({ error: 'invalid_project_id' });
    }
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return reply.code(404).send({ error: 'not_found' });
    return {
      ok: true,
      projectId,
      autoDeploy: project.autoDeploy,
      defaultBranch: project.defaultBranch,
      events: ['push'],
    };
  });
}