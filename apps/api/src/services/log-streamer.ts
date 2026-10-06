/**
 * Per-deployment log buffer + SSE fan-out + DB persistence.
 *
 * Three responsibilities:
 *   1. Persist every log line to the database (deployments.build_logs) so the
 *      UI shows real-time status on poll, not just the SSE stream.
 *   2. Keep an in-memory buffer for the SSE stream (capped at 5,000 lines) so
 *      newly-attached subscribers can replay recent lines.
 *   3. Update the deployment status in BOTH the in-memory stream and the DB
 *      so a fresh page load sees the current state, not "queued" forever.
 *
 * Bug fixed in Phase 4d: previously setStatus only updated the in-memory stream.
 * The DB stayed at 'queued' until terminal failure. UI polls /api/deployments/:id
 * which reads from DB, so the UI always showed 'queued'. Now setStatus and
 * appendLog are DB-backed.
 */

import type { DeploymentStatus, LogStreamEvent } from '@deplox/shared-types';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deployments } from '../db/schema.js';
import { childLogger } from '@deplox/shared-logger';

const log = childLogger({ component: 'log-streamer' });

interface Subscription {
  readonly id: string;
  send(event: LogStreamEvent): void;
  close(): void;
}

interface DeploymentStream {
  readonly deploymentId: string;
  status: DeploymentStatus;
  readonly lines: string[];
  readonly subscribers: Set<Subscription>;
}

const streams = new Map<string, DeploymentStream>();

export function getOrCreateStream(deploymentId: string): DeploymentStream {
  let s = streams.get(deploymentId);
  if (!s) {
    s = {
      deploymentId,
      status: 'queued',
      lines: [],
      subscribers: new Set(),
    };
    streams.set(deploymentId, s);
  }
  return s;
}

/**
 * Update deployment status. Writes to BOTH:
 *   - in-memory stream (so SSE subscribers see the change immediately)
 *   - DB row (so the UI poll sees the change on next fetch)
 *
 * Awaitable. Errors are logged but never thrown — caller is in a hot path.
 */
export async function setStatus(deploymentId: string, status: DeploymentStatus): Promise<void> {
  const s = getOrCreateStream(deploymentId);
  s.status = status;
  broadcast(deploymentId, { type: 'status', status, ts: new Date().toISOString() });

  try {
    await db
      .update(deployments)
      .set({ status })
      .where(eq(deployments.id, deploymentId));
  } catch (err) {
    log.error({ err, deploymentId, status }, 'failed to persist status to DB');
  }
}

/**
 * Append a log line. Writes to BOTH:
 *   - in-memory stream (for SSE replay)
 *   - DB row's build_logs column (for permanent record + UI poll)
 *
 * DB writes are fire-and-forget — we don't block the orchestrator on every line.
 */
export function appendLog(deploymentId: string, line: string): void {
  const s = getOrCreateStream(deploymentId);
  if (s.lines.length >= 5000) s.lines.shift();
  s.lines.push(line);
  broadcast(deploymentId, { type: 'log', line, ts: new Date().toISOString() });

  // Async DB persist — don't await, but catch errors
  void persistLogs(deploymentId, s.lines.join('\n')).catch((err) => {
    log.error({ err, deploymentId }, 'failed to persist log line');
  });
}

async function persistLogs(deploymentId: string, joined: string): Promise<void> {
  await db
    .update(deployments)
    .set({ buildLogs: joined })
    .where(eq(deployments.id, deploymentId));
}

export function appendError(deploymentId: string, message: string): void {
  broadcast(deploymentId, { type: 'error', message, ts: new Date().toISOString() });
}

export function completeStream(deploymentId: string, status: DeploymentStatus): void {
  broadcast(deploymentId, { type: 'done', status, ts: new Date().toISOString() });
  // Keep the stream around for a short window so SSE clients can drain it.
  setTimeout(() => {
    streams.delete(deploymentId);
  }, 60_000);
}

export function subscribe(
  deploymentId: string,
  sub: Subscription,
): () => void {
  const s = getOrCreateStream(deploymentId);
  s.subscribers.add(sub);

  // Replay existing lines to the new subscriber.
  for (const line of s.lines) {
    sub.send({ type: 'log', line, ts: new Date().toISOString() });
  }
  // Send current status.
  sub.send({ type: 'status', status: s.status, ts: new Date().toISOString() });

  return () => {
    s.subscribers.delete(sub);
    sub.close();
  };
}

function broadcast(deploymentId: string, event: LogStreamEvent): void {
  const s = streams.get(deploymentId);
  if (!s) return;
  for (const sub of s.subscribers) {
    try {
      sub.send(event);
    } catch {
      s.subscribers.delete(sub);
    }
  }
}

export function getBufferedLogs(deploymentId: string): string[] {
  return [...(streams.get(deploymentId)?.lines ?? [])];
}