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
import { registerDomainRoute, unregisterDomainRoute, registerAutoSubdomainRoute, unregisterAutoSubdomainRoute } from './caddy.js';

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

    // -- DECRYPT ENV VARS -------------------------------------------------
    // Need to do this BEFORE the build so we can pass them as build-args to
    // Docker; Vite-bundled frontends (react/next) inline `import.meta.env.*`
    // references at build time.
    const envRows = await db
      .select()
      .from(envVarsTable)
      .where(eq(envVarsTable.projectId, project.id));
    const decryptedEnv = envRows.map((r) => ({
      key: r.key,
      value: decrypt(r.encryptedValue),
    }));

    // -- BUILD ------------------------------------------------------------
    setStatus(deploymentId, 'building');
    const buildResult = await provider.build({
      deploymentId,
      sourceDir: clone.workdir,
      framework,
      // Env vars are decrypted above and need to reach the build stage so
      // that Vite-bundled frontends (react/next) can inline `import.meta.env.*`
      // references. The provider forwards them as Docker build-args; the
      // generated Dockerfile declares matching `ARG`/`ENV` lines and also
      // auto-derives `VITE_<KEY>` from any non-prefixed key for Vite apps.
      envVars: decryptedEnv,
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

    // -- ALLOCATE PORT ----------------------------------------------------
    const hostPort = await allocatePort();
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

    // -- HEALTH CHECK ------------------------------------------------------
    // `container.start()` only confirms Docker has spawned the process — the
    // app inside might still be booting, crash-looping, or fail to bind.
    // We poll the host port for up to 30s and treat any TCP-accept or HTTP
    // response as "the process is alive". If nothing responds, we mark the
    // deployment failed with the recent container logs so the user can see
    // why.
    appendLog(deploymentId, `[deplox] health-checking localhost:${hostPort}…`);
    const healthy = await waitForPort(hostPort, 30_000, (attempt) => {
      if (attempt > 1 && attempt % 5 === 0) {
        appendLog(deploymentId, `[deplox] still waiting for the app to listen (attempt ${attempt})…`);
      }
    });
    if (!healthy) {
      const recent = await getRecentContainerLogs(deploymentId, runResult.containerId);
      throw new Error(
        `App did not start listening on port ${hostPort} within 30s. ` +
          `Most common causes: missing required env vars (DATABASE_URL, API keys, etc.), ` +
          `wrong entry point, or the app crashed on boot. Recent logs:\n${recent}`,
      );
    }
    appendLog(deploymentId, `[deplox] app is accepting connections on :${hostPort}`);

    const publicUrl = buildPublicUrl(hostPort, project.customDomain, project.id, project.name);

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

    // Stage 3.1: register the Caddy route so the custom domain resolves to
    // this deployment's host port. Caddy will issue a Let's Encrypt cert via
    // on-demand TLS on first request. Failures here are non-fatal — the
    // container is running; the user just won't be able to reach it via the
    // custom domain until Caddy is reachable.
    if (project.customDomain) {
      const result = await registerDomainRoute(project.id, project.customDomain, hostPort);
      if (!result.ok) {
        appendLog(
          deploymentId,
          `[deplox] caddy route registration failed for ${project.customDomain}: ${result.message}`,
        );
      } else {
        appendLog(
          deploymentId,
          `[deplox] caddy route registered: ${project.customDomain} → localhost:${hostPort}`,
        );
      }
    }

    // Stage 3.x: ALSO register the auto-generated `*.deplox.site` subdomain
    // so every deplox-deployed app is publicly reachable out of the box
    // (even before the user wires up a custom domain). The Cloudflare
    // tunnel already forwards all `*.deplox.site` to Caddy, so we just need
    // a Caddy route per running project. Failures are non-fatal.
    //
    // Pick the short slug-acronym form first; if a DB collision (another
    // project already owns that exact subdomain), fall back to the longer
    // suffixed form so URLs stay short in the common case.
    let autoSubdomain = buildAutoSubdomain(project.id, project.name);
    const collision = await findSubdomainCollision(autoSubdomain, project.id);
    if (collision) {
      autoSubdomain = buildAutoSubdomainWithSuffix(project.id, project.name);
    }
    const autoResult = await registerAutoSubdomainRoute(project.id, autoSubdomain, hostPort);
    if (!autoResult.ok) {
      appendLog(
        deploymentId,
        `[deplox] caddy route registration failed for ${autoSubdomain}: ${autoResult.message}`,
      );
    } else {
      appendLog(
        deploymentId,
        `[deplox] caddy route registered: https://${autoSubdomain} → localhost:${hostPort}`,
      );
    }

    log.info({ deploymentId, publicUrl, autoSubdomain }, 'deployment running');
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

  // Remove the Caddy route for this project's custom domain (if any).
  // The next running deployment for this project will re-register with its
  // own host port; until then, the domain has no upstream.
  const [project] = await db
    .select({ id: projects.id, customDomain: projects.customDomain, name: projects.name })
    .from(projects)
    .where(eq(projects.id, row.projectId));
  if (project?.customDomain) {
    unregisterDomainRoute(project.id).catch((err) => {
      log.warn({ err, projectId: project.id }, 'caddy unregister failed on stop');
    });
  }
  // Also tear down the auto-subdomain route — the next deploy will
  // re-register it against whatever new host port is allocated.
  if (project) {
    unregisterAutoSubdomainRoute(project.id).catch((err) => {
      log.warn({ err, projectId: project.id }, 'caddy auto-subdomain unregister failed on stop');
    });
  }

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

  const hostPort = await allocatePort();
  let runResult: import('@deplox/shared-types').RunResult;
  try {
    runResult = await provider.run({
      deploymentId: newRow.id,
      imageTag: target.imageTag,
      hostPort,
      envVars: decryptedEnv,
      framework: (target.framework ?? 'static') as import('@deplox/shared-types').Framework,
      onLog: ({ text }) => appendLog(newRow.id, text),
    });
  } catch (err) {
    // Free the port we just allocated so it doesn't get stuck in the in-use set.
    releasePort(hostPort);
    throw err;
  }

  const publicUrl = buildPublicUrl(hostPort, project.customDomain, project.id, project.name);

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

function buildPublicUrl(
  hostPort: number,
  customDomain: string | null,
  projectId: string,
  projectName: string,
): string {
  if (customDomain) {
    // Custom domain takes priority (Caddy issues Let's Encrypt cert on demand).
    return `https://${customDomain}`;
  }
  // Auto-generated `*.deplox.site` subdomain is the public URL of last
  // resort. It's always wired to the running container via the auto Caddy
  // route, so the user has a shareable URL the moment the deploy goes
  // green — no DNS, no domain purchase, no config.
  return `https://${buildAutoSubdomain(projectId, projectName)}`;
}

/**
 * Slugify a project name into a DNS-safe subdomain prefix. The result is
 * always lowercase, alphanumerics + hyphens only, max 40 chars. If the
 * project name has nothing alphanumeric, falls back to `app`.
 */
function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'app';
}

/**
 * Generate the `*.deplox.site` subdomain for a project. Always
 * deterministically derived from `(projectId, projectName)`, so re-running
 * a deploy produces the same subdomain (no churn, no broken links).
 *
 * Format: `<slug>-<acronym>.deplox.site` — short and human-readable.
 *
 * Examples:
 *   "event-checkin"                 → "event-checkin-ec.deplox.site"
 *   "glbitm-attendance-system"      → "glbitm-attendance-system-gas.deplox.site"
 *   "VelvetBrew-Coffee"             → "velvetbrew-coffee-vc.deplox.site"
 *
 * If the resulting subdomain already exists for another project (DB-level
 * collision check done by the caller), a 4-char project-id suffix is
 * appended to keep it short in the common case while staying unique.
 */
export function buildAutoSubdomain(projectId: string, projectName: string): string {
  const slug = slugifyName(projectName);
  const acronym = buildAcronym(slug);
  return `${slug}-${acronym}.deplox.site`;
}

/**
 * Variant of buildAutoSubdomain that adds a 4-char project-id suffix to
 * disambiguate from another project with the same slug+acronym. Used by
 * the orchestrator when it detects a collision in the DB before writing
 * the new publicUrl.
 */
export function buildAutoSubdomainWithSuffix(projectId: string, projectName: string): string {
  const slug = slugifyName(projectName);
  const acronym = buildAcronym(slug);
  const suffix = projectId.replace(/-/g, '').slice(0, 4).toLowerCase();
  return `${slug}-${acronym}-${suffix}.deplox.site`;
}

/**
 * Returns true if `subdomain` (full `*.deplox.site` hostname) is already
 * claimed by ANOTHER project in the DB. Used to decide whether the
 * orchestrator should append a short id suffix to keep URLs unique.
 */
async function findSubdomainCollision(
  subdomain: string,
  excludeProjectId: string,
): Promise<boolean> {
  const { sql } = await import('drizzle-orm');
  const rows = await db.execute(sql`
    SELECT 1 FROM deployments
    WHERE public_url = ${'https://' + subdomain}
      AND project_id <> ${excludeProjectId}
    LIMIT 1
  `);
  // db.execute returns { rows: [...] } in postgres-js
  const arr = (rows as { rows?: unknown[] }).rows ?? (rows as unknown[]);
  return Array.isArray(arr) && arr.length > 0;
}

/**
 * First-letter acronym for a slug: each hyphen-separated word contributes
 * its first character. Empty / single-char words are skipped.
 *   "event-checkin"                 → "ec"
 *   "glbitm-attendance-system"      → "gas"
 *   "velvetbrew-coffee"             → "vc"
 */
function buildAcronym(slug: string): string {
  const letters = slug
    .split('-')
    .filter((w) => w.length > 0)
    .map((w) => w[0]);
  // Always at least one character (slugifyName guarantees non-empty input).
  return letters.length > 0 ? letters.join('') : 'app';
}

async function collectLogs(deploymentId: string): Promise<string> {
  const { getBufferedLogs } = await import('./log-streamer.js');
  return getBufferedLogs(deploymentId).join('\n');
}

/**
 * Polls `localhost:port` every 500ms until it responds to a plain TCP connect
 * (or any HTTP request). Used after `container.start()` to make sure the app
 * inside is actually up before we mark the deployment "running".
 */
async function waitForPort(
  port: number,
  timeoutMs: number,
  onAttempt?: (n: number) => void,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    onAttempt?.(attempt);
    try {
      // A HTTP probe doubles as a "the app accepted a request" check;
      // a refused connection surfaces fast so we retry quickly.
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1500),
      });
      // Any HTTP response (including 404) means the app is alive.
      if (res.status >= 100) return true;
    } catch {
      // ECONNREFUSED = not listening yet — that's normal during boot.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Fetches the most recent runtime logs from the running container so the user
 * can see *why* the app failed to start. Falls back to empty string if logs
 * can't be retrieved.
 */
async function getRecentContainerLogs(deploymentId: string, containerId: string): Promise<string> {
  try {
    const provider = getDockerProvider();
    if ('logs' in provider && typeof provider.logs === 'function') {
      const text = await provider.logs({ containerId, tail: 80 });
      return text.split('\n').slice(-40).join('\n');
    }
  } catch (err) {
    log.warn({ err, deploymentId }, 'failed to fetch container logs for diagnostics');
  }
  return '(no logs available)';
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