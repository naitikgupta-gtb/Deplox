/**
 * Deployment orchestrator.
 *
 * Coordinates the lifecycle of a single deployment:
 *   queue → clone → detect framework → build → run → running
 *                                                    ↓
 *                                          stopped / rolled-back / failed
 *
 * It is intentionally framework-agnostic: all framework-specific behaviour
 * lives in `framework-detector.ts` and `docker/{real,mock}.ts`.
 *
 * Per DEPLOX_SECURITY_ARCHITECTURE.md §8 — build plane and runtime plane are
 * strictly separated; the orchestrator never reaches into the host.
 */

import { eq } from 'drizzle-orm';
import { childLogger } from '@deplox/shared-logger';
import { db } from '../db/client.js';
import { deployments, envVars as envVarsTable, projects, users } from '../db/schema.js';
import type { BuildJobPayload, RunJobPayload } from '@deplox/shared-types';
import { FrameworkDetectionError, detectFramework, defaultPortFor } from './framework-detector.js';
import { cloneRepo, disposeClone, type CloneResult } from './github.js';
import { allocatePort, releasePort } from './port-allocator.js';
import { getDockerProvider } from './docker/provider.js';
import { decrypt } from './encryption.js';
import {
  appendLog,
  appendError,
  completeStream,
  setStatus,
} from './log-streamer.js';

const log = childLogger({ component: 'orchestrator' });

/**
 * Run the full build+run cycle for a deployment. Updates DB rows and the
 * log stream in real time. Resolves when the deployment reaches a terminal
 * state (running, failed, or stopped).
 */
export async function runDeployment(deploymentId: string): Promise<void> {
  const [row] = await db.select().from(deployments).where(eq(deployments.id, deploymentId));
  if (!row) throw new Error(`Deployment ${deploymentId} not found`);
  const [project] = await db.select().from(projects).where(eq(projects.id, row.projectId));
  if (!project) throw new Error(`Project ${row.projectId} not found`);

  // The GitHub OAuth token is on the user record (not per-project), so we
  // look it up via the project's user_id. We need it for private repos and
  // to stay under GitHub's 5000/hr authenticated rate limit.
  const [ownerRow] = await db
    .select({ token: users.githubAccessTokenEncrypted })
    .from(users)
    .where(eq(users.id, project.userId));
  const accessToken = ownerRow?.token
    ? decrypt(ownerRow.token)
    : null;

  let clone: CloneResult | null = null;
  let allocatedPort: number | null = null;
  const provider = getDockerProvider();

  try {
    // -- CLONE ------------------------------------------------------------
    setStatus(deploymentId, 'cloning');
    appendLog(deploymentId, `[deplox] cloning ${project.githubRepoFullName} @ ${row.commitSha.slice(0, 7)}`);

    clone = await cloneRepo(project.githubRepoFullName, row.commitSha, accessToken);
    appendLog(deploymentId, `[deplox] cloned to ${clone.workdir}`);
    appendLog(deploymentId, `[deplox] HEAD: ${clone.commitMessage ?? '(no message)'}`);

    // -- FRAMEWORK DETECT -------------------------------------------------
    setStatus(deploymentId, 'detecting');
    let framework = row.framework as
      | import('@deplox/shared-types').Framework
      | null;
    try {
      framework = await detectFramework(clone.workdir);
      appendLog(deploymentId, `[deplox] detected framework: ${framework}`);
    } catch (err) {
      if (err instanceof FrameworkDetectionError) {
        throw err;
      }
      throw new FrameworkDetectionError(String((err as Error).message ?? err));
    }

    await db
      .update(deployments)
      .set({ framework })
      .where(eq(deployments.id, deploymentId));

    // -- BUILD ------------------------------------------------------------
    setStatus(deploymentId, 'building');
    const buildResult = await provider.build({
      deploymentId,
      sourceDir: clone.workdir,
      framework,
      onLog: ({ stream, text }) => {
        appendLog(deploymentId, text);
      },
    });
    appendLog(
      deploymentId,
      `[deplox] build complete in ${(buildResult.durationMs / 1000).toFixed(1)}s → ${buildResult.imageTag}`,
    );

    // Persist the image tag now so a future rollback can re-run it.
    await db
      .update(deployments)
      .set({ imageTag: buildResult.imageTag })
      .where(eq(deployments.id, deploymentId));

    // -- DECRYPT ENV VARS -------------------------------------------------
    const envRows = await db
      .select()
      .from(envVarsTable)
      .where(eq(envVarsTable.projectId, project.id));
    const decryptedEnv = envRows.map((r) => ({
      key: r.key,
      value: decrypt(r.encryptedValue),
    }));

    // -- ALLOCATE PORT ----------------------------------------------------
    const hostPort = allocatePort();
    allocatedPort = hostPort;
    appendLog(deploymentId, `[deplox] allocated host port ${hostPort} → container :${defaultPortFor(framework)}`);

    // -- RUN --------------------------------------------------------------
    setStatus(deploymentId, 'starting');
    const runResult = await provider.run({
      deploymentId,
      imageTag: buildResult.imageTag,
      hostPort,
      envVars: decryptedEnv,
      framework,
      onLog: ({ stream, text }) => {
        appendLog(deploymentId, text);
      },
    });

    const publicUrl = buildPublicUrl(hostPort, project.customDomain);

    await db
      .update(deployments)
      .set({
        status: 'running',
        containerId: runResult.containerId,
        hostPort,
        publicUrl,
        finishedAt: new Date(),
        buildLogs: await collectLogs(deploymentId),
      })
      .where(eq(deployments.id, deploymentId));

    setStatus(deploymentId, 'running');
    completeStream(deploymentId, 'running');
    log.info({ deploymentId, publicUrl }, 'deployment running');
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    appendError(deploymentId, message);
    appendLog(deploymentId, `[deplox] failed: ${message}`);
    await db
      .update(deployments)
      .set({
        status: 'failed',
        errorMessage: message,
        finishedAt: new Date(),
        buildLogs: await collectLogs(deploymentId),
      })
      .where(eq(deployments.id, deploymentId));
    completeStream(deploymentId, 'failed');
    if (allocatedPort !== null) releasePort(allocatedPort);
    log.error({ err, deploymentId }, 'deployment failed');
    throw err;
  } finally {
    if (clone) await disposeClone(clone.workdir);
  }
}

export async function stopDeployment(deploymentId: string): Promise<void> {
  const [row] = await db.select().from(deployments).where(eq(deployments.id, deploymentId));
  if (!row) throw new Error(`Deployment ${deploymentId} not found`);

  setStatus(deploymentId, 'stopped');
  appendLog(deploymentId, '[deplox] stopping container');

  const provider = getDockerProvider();
  if (row.containerId) {
    await provider.stop({ containerId: row.containerId });
  }
  if (row.hostPort) releasePort(row.hostPort);

  await db
    .update(deployments)
    .set({
      status: 'stopped',
      finishedAt: new Date(),
    })
    .where(eq(deployments.id, deploymentId));

  completeStream(deploymentId, 'stopped');
}

/**
 * Rolls a project back to a previous successful deployment. We re-run the
 * prior deployment's stored image (cheap) rather than rebuilding.
 */
export async function rollbackDeployment(
  projectId: string,
  targetDeploymentId: string,
): Promise<string> {
  const [target] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, targetDeploymentId));
  if (!target) throw new Error(`Target deployment ${targetDeploymentId} not found`);
  if (target.projectId !== projectId) {
    throw new Error('Target deployment does not belong to this project');
  }
  if (!target.imageTag) {
    throw new Error('Target deployment has no built image to restore');
  }

  // Stop any currently running deployments for this project.
  const running = await db
    .select()
    .from(deployments)
    .where(eq(deployments.projectId, projectId));
  for (const r of running) {
    if (r.status === 'running' || r.status === 'starting') {
      await stopDeployment(r.id);
    }
  }

  // Create a new deployment row that mirrors target but starts fresh.
  const [newRow] = await db
    .insert(deployments)
    .values({
      projectId,
      commitSha: target.commitSha,
      commitMessage: `Rollback to ${target.commitSha.slice(0, 7)}`,
      commitAuthor: target.commitAuthor,
      status: 'queued',
      framework: target.framework,
    })
    .returning();
  if (!newRow) throw new Error('Failed to create rollback deployment row');

  // Inline run using target's image (skip the build step).
  setStatus(newRow.id, 'starting');
  const provider = getDockerProvider();

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error('Project not found');

  // Decrypt env vars
  const envRows = await db.select().from(envVarsTable).where(eq(envVarsTable.projectId, projectId));
  const decryptedEnv = envRows.map((r) => ({ key: r.key, value: decrypt(r.encryptedValue) }));

  const hostPort = allocatePort();
  const runResult = await provider.run({
    deploymentId: newRow.id,
    imageTag: target.imageTag,
    hostPort,
    envVars: decryptedEnv,
    framework: (target.framework ?? 'static') as import('@deplox/shared-types').Framework,
    onLog: ({ text }) => appendLog(newRow.id, text),
  });

  const publicUrl = buildPublicUrl(hostPort, project.customDomain);

  await db
    .update(deployments)
    .set({
      status: 'running',
      containerId: runResult.containerId,
      hostPort,
      publicUrl,
      finishedAt: new Date(),
    })
    .where(eq(deployments.id, newRow.id));

  setStatus(newRow.id, 'running');
  completeStream(newRow.id, 'running');
  return newRow.id;
}

function buildPublicUrl(hostPort: number, customDomain: string | null): string {
  if (customDomain) return `https://${customDomain}`;
  // For local Stage 1/2: we expose directly on host port.
  return `http://localhost:${hostPort}`;
}

async function collectLogs(deploymentId: string): Promise<string> {
  const { getBufferedLogs } = await import('./log-streamer.js');
  return getBufferedLogs(deploymentId).join('\n');
}

// BullMQ payload helpers ------------------------------------------------------

export function buildJobPayload(
  deploymentId: string,
  projectId: string,
  userId: string,
  githubRepoFullName: string,
  commitSha: string,
  githubAccessToken: string | null,
): BuildJobPayload {
  return { deploymentId, projectId, userId, githubRepoFullName, commitSha, githubAccessToken };
}

export function runJobPayload(
  deploymentId: string,
  projectId: string,
  hostPort: number,
  framework: import('@deplox/shared-types').Framework,
  imageTag: string,
  envVars: ReadonlyArray<{ key: string; value: string }>,
): RunJobPayload {
  return { deploymentId, projectId, hostPort, framework, imageTag, envVars };
}