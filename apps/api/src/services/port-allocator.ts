/**
 * Allocates host ports for runtime containers from
 * DEPLOX_DEPLOY_PORT_RANGE_START .. DEPLOX_DEPLOY_PORT_RANGE_END.
 *
 * Each port is bound to exactly one *running* deployment at a time. When a
 * deployment is stopped, rolled back, or replaced, its port is freed.
 *
 * In mock mode we just track in-memory; in production this would also be
 * persisted in Postgres so restarts don't reuse ports of orphaned containers.
 */

import { db } from '../db/client.js';
import { deployments } from '../db/schema.js';
import { inArray } from 'drizzle-orm';
import { loadConfig } from '@deplox/shared-config';

const cfg = loadConfig();
const RANGE_START = cfg.DEPLOX_DEPLOY_PORT_RANGE_START;
const RANGE_END = cfg.DEPLOX_DEPLOY_PORT_RANGE_END;

const inUse = new Set<number>();

/** Pre-seed the in-use set with ports currently held by running deployments. */
export async function primePortCache(): Promise<void> {
  const rows = await db
    .select({ hostPort: deployments.hostPort })
    .from(deployments)
    .where(inArray(deployments.status, ['running', 'starting']));
  for (const r of rows) {
    if (typeof r.hostPort === 'number') inUse.add(r.hostPort);
  }
}

export function allocatePort(): number {
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