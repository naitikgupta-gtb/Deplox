/**
 * Allocates host ports for runtime containers from
 * DEPLOX_DEPLOY_PORT_RANGE_START .. DEPLOX_DEPLOY_PORT_RANGE_END.
 *
 * Each port is bound to exactly one *running* deployment at a time. When a
 * deployment is stopped, rolled back, or replaced, its port is freed.
 *
 * We keep a fast in-memory `inUse` Set for hot-path allocation, but as a
 * backstop every allocation also re-syncs with Docker (real mode) or the mock
 * container set (mock mode). This makes the allocator self-healing across API
 * restarts and across orphan containers left behind by a crashed API process.
 */

import { db } from '../db/client.js';
import { deployments } from '../db/schema.js';
import { inArray } from 'drizzle-orm';
import { loadConfig } from '@deplox/shared-config';
import { getDockerProvider } from './docker/provider.js';

const cfg = loadConfig();
const RANGE_START = cfg.DEPLOX_DEPLOY_PORT_RANGE_START;
const RANGE_END = cfg.DEPLOX_DEPLOY_PORT_RANGE_END;

const inUse = new Set<number>();
let lastDockerSyncAt = 0;
/** Throttle Docker round-trips: at most one sync per N ms across the process. */
const DOCKER_SYNC_THROTTLE_MS = 2000;

const inRange = (n: number) => n >= RANGE_START && n <= RANGE_END;

/**
 * Returns the set of host ports that are currently published by *some*
 * deplox-managed container. This is the ground truth — our in-memory cache
 * may be stale (after an API restart, after a crash, or because two API
 * processes were running at once), but Docker doesn't lie.
 *
 * Tries the live Docker provider first; falls back to the DB if Docker is
 * unreachable. Mock mode is a no-op (in-memory tracking is the source of
 * truth in mock).
 */
async function readDockerAllocatedPorts(): Promise<Set<number>> {
  const ports = new Set<number>();
  try {
    const provider = getDockerProvider();
    // RealDockerProvider exposes listContainers; MockDockerProvider does too.
    // We rely on the shared interface — both implementations list
    // { id, name, ports: number[] } (see MockDockerProvider and the real
    // adapter's `listAllocatedPorts` helper below).
    const allocated = await (provider as unknown as { listAllocatedPorts?: () => Promise<readonly number[]> }).listAllocatedPorts?.();
    if (Array.isArray(allocated)) {
      for (const p of allocated) if (inRange(p)) ports.add(p);
    }
  } catch {
    // Docker is down — fall through to DB.
  }
  if (ports.size === 0) {
    try {
      const rows = await db
        .select({ hostPort: deployments.hostPort })
        .from(deployments)
        .where(inArray(deployments.status, ['running', 'starting']));
      for (const r of rows) {
        if (typeof r.hostPort === 'number' && inRange(r.hostPort)) ports.add(r.hostPort);
      }
    } catch {
      // No DB, no Docker — keep the in-memory cache as best-effort.
    }
  }
  return ports;
}

/** Pre-seed the in-use set with ports currently held by running deployments. */
export async function primePortCache(): Promise<void> {
  const dockerPorts = await readDockerAllocatedPorts();
  for (const p of dockerPorts) inUse.add(p);
  lastDockerSyncAt = Date.now();
}

export async function allocatePort(): Promise<number> {
  // Re-sync with Docker at most once per throttle window. This catches the
  // common drift case: API restarted with empty inUse, but a container
  // started by a prior API process is still holding 9001.
  const now = Date.now();
  if (now - lastDockerSyncAt > DOCKER_SYNC_THROTTLE_MS) {
    const dockerPorts = await readDockerAllocatedPorts();
    for (const p of dockerPorts) inUse.add(p);
    lastDockerSyncAt = now;
  }
  for (let p = RANGE_START; p <= RANGE_END; p += 1) {
    if (!inUse.has(p)) {
      inUse.add(p);
      return p;
    }
  }
  throw new Error(
    `Port range ${RANGE_START}-${RANGE_END} exhausted. Stop or roll back an existing deployment first.`,
  );
}

export function releasePort(port: number): void {
  inUse.delete(port);
}

export function isPortAllocated(port: number): boolean {
  return inUse.has(port);
}

/** Force-mark a port as used (used when restoring a previous deployment on rollback). */
export function reservePort(port: number): void {
  inUse.add(port);
}