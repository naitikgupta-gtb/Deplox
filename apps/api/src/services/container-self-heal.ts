/**
 * Container self-heal — application-level watchdog for deplox-deployed
 * containers. The Docker `restart=always` policy is set when we create the
 * container, but Docker Desktop on this machine has been observed to ignore
 * that policy for Dockerode-created containers after a `docker stop` (the
 * container exits but never auto-restarts, even though `HostConfig.
 * RestartPolicy.Name === 'always'`). This service fills that gap: it
 * periodically checks that every deployment with `status='running'` in the DB
 * actually has a running container, and `docker start`s any that have died.
 *
 * On startup it also marks deployments whose container has been garbage-
 * collected (e.g. manually `docker rm`'d) as `status='failed'` so the user
 * sees a clear signal rather than a 502 indefinitely.
 *
 * Wired into the API's `buildServer()` (one-shot startup scan) AND a 30s
 * periodic interval (catches in-flight crashes).
 */

import { and, eq, isNotNull } from 'drizzle-orm';
import { childLogger } from '@deplox/shared-logger';
import { db } from '../db/client.js';
import { deployments } from '../db/schema.js';
import { docker } from './docker/real.js';

const log = childLogger({ component: 'container-self-heal' });

const PERIODIC_INTERVAL_MS = 30_000;
const HEALTH_PROBE_TIMEOUT_MS = 5000;

/**
 * Skip the TCP probe (and the resulting `docker restart`) for containers
 * that are still warming up. Vite/Next dev servers can take 60-90s to
 * bind the port after container start; without this grace window, self-heal
 * hard-restarts a healthy container the moment the probe fires before the
 * dev server is up, which manifests as flapping 502s on deplox.site.
 */
const STARTUP_GRACE_MS = 90_000;

/**
 * TCP-level reachability probe for a deplox-deployed container.
 *
 * We don't speak HTTP — we just check that the host port answers a TCP
 * SYN within the timeout. This is good enough to distinguish "app
 * crashed, port closed" from "app running, port open". A `docker restart`
 * on a truly-up-but-broken container is cheap and self-correcting, so
 * we trade a few false-positive restarts (during slow app boot) for
 * catching the real "app is wedged" case within 30s instead of forever.
 *
 * Connects to 127.0.0.1 (loopback) because the deplox app's exposed port
 * is published to the host network, and the API process runs on the host
 * (via `pnpm dev` / `tsx watch`). `host.docker.internal` is a Docker
 * Desktop feature meant for in-container use; it does not always resolve
 * on the host, which caused every probe to fail and every container to
 * be restarted every 30s — the SIGTERM kept killing the slow-booting
 * apps (Vite/Next dev servers) before they could bind the port.
 */
async function probeHostPort(hostPort: number, timeoutMs: number): Promise<boolean> {
  const net = await import('node:net');
  return new Promise<boolean>((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(hostPort, '127.0.0.1');
  });
}

export interface SelfHealResult {
  scanned: number;
  restarted: number;
  missing: number;
}

/**
 * One scan: for every deployment row that says `status='running'`, check
 * Docker. If the container is stopped/exited, `docker start` it. If it's
 * gone entirely (404 from inspect), mark the deployment `failed`.
 *
 * Returns a tally so the caller can log it.
 */
export async function selfHealContainers(): Promise<SelfHealResult> {
  const rows = await db
    .select({
      id: deployments.id,
      containerId: deployments.containerId,
      hostPort: deployments.hostPort,
    })
    .from(deployments)
    .where(and(eq(deployments.status, 'running'), isNotNull(deployments.containerId)));

  if (rows.length === 0) {
    return { scanned: 0, restarted: 0, missing: 0 };
  }

  let restarted = 0;
  let missing = 0;

  for (const row of rows) {
    if (!row.containerId) continue;
    try {
      // `docker.getContainer` returns a Container but the dockerode 4 type
      // declarations don't expose inspect/restart in a way tsc picks up; cast
      // through `any` at the call site rather than polluting the whole module.
      const container = docker.getContainer(row.containerId) as unknown as {
        inspect(): Promise<{ State?: { Running?: boolean; StartedAt?: string } }>;
        restart(opts?: { t?: number }): Promise<void>;
        start(): Promise<void>;
      };
      const info = await container.inspect();
      if (info.State?.Running) {
        // Container is up — but is the app inside actually serving? The
        // container can be "Up" while the app process has crashed
        // (OOM, unhandled exception, deadlock). Caddy would return 502
        // for those because upstream is unreachable. Probe the app's
        // host port and `docker restart` (hard restart) if it doesn't
        // respond. Uses host.docker.internal because we're inside Docker
        // and the container's exposed port is published to the host.
        //
        // Skip the probe for the first STARTUP_GRACE_MS after a container
        // (re)start — dev servers can take that long to bind the port and
        // the probe would otherwise flap the container on every tick.
        const startedAt = info.State.StartedAt ? new Date(info.State.StartedAt).getTime() : 0;
        const warm = startedAt > 0 && Date.now() - startedAt < STARTUP_GRACE_MS;
        if (row.hostPort && !warm) {
          const healthy = await probeHostPort(row.hostPort, 2000);
          if (!healthy) {
            log.warn(
              { deploymentId: row.id, containerId: row.containerId, hostPort: row.hostPort },
              'deplox container up but app not responding — restarting',
            );
            await container.restart({ t: 5 });
            restarted += 1;
            log.info(
              { deploymentId: row.id, containerId: row.containerId, hostPort: row.hostPort },
              'restarted unresponsive deplox container',
            );
          }
        }
        continue;
      }
      // Container exists but isn't running — start it.
      await container.start();
      restarted += 1;
      log.info(
        { deploymentId: row.id, containerId: row.containerId, hostPort: row.hostPort },
        'restarted stopped deplox container',
      );
    } catch (err) {
      const message = String((err as { reason?: string })?.reason ?? err);
      // 404 Not Found means the container was removed out-of-band. Anything
      // else (daemon down, transient network error) we treat as "try again
      // next tick" rather than marking failed.
      if (/not found|no such container/i.test(message)) {
        missing += 1;
        log.warn(
          { deploymentId: row.id, containerId: row.containerId },
          'deplox container gone — marking deployment failed',
        );
        try {
          await db
            .update(deployments)
            .set({
              status: 'failed',
              errorMessage: 'container was removed; redeploy to recreate',
              finishedAt: new Date(),
            })
            .where(eq(deployments.id, row.id));
        } catch (dbErr) {
          log.warn({ err: String(dbErr) }, 'failed to mark deployment as failed');
        }
      } else {
        log.warn(
          { deploymentId: row.id, containerId: row.containerId, err: message },
          'self-heal inspect failed; will retry next tick',
        );
      }
    }
  }

  return { scanned: rows.length, restarted, missing };
}

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Wire up the periodic self-heal loop. Idempotent — calling twice does
 * nothing extra. Run once at API startup, then every PERIODIC_INTERVAL_MS.
 *
 * The first scan happens in the BACKGROUND (not awaited) so the API starts
 * serving traffic immediately and we don't add 10s of cold-start latency
 * when there are many deployments.
 */
export function startContainerSelfHeal(): void {
  if (intervalHandle) return;
  // Fire-and-forget first scan; the API is already up at this point.
  selfHealContainers()
    .then((result) => {
      if (result.restarted > 0 || result.missing > 0) {
        log.info(result, 'initial self-heal scan done');
      }
    })
    .catch((err) => log.warn({ err }, 'initial self-heal scan failed'));
  intervalHandle = setInterval(() => {
    selfHealContainers()
      .then((result) => {
        if (result.restarted > 0 || result.missing > 0) {
          log.info(result, 'self-heal scan done');
        }
      })
      .catch((err) => log.warn({ err }, 'periodic self-heal scan failed'));
  }, PERIODIC_INTERVAL_MS);
}

/** Stop the periodic loop (used in tests / graceful shutdown). */
export function stopContainerSelfHeal(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}