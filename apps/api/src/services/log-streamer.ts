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

/**
 * Postgres UTF-8 columns reject a few specific byte values that are valid in
 * raw bytes but not valid Unicode scalar values — most notably 0x00 (NUL).
 * If a container writes a NUL byte to stdout (often as padding inside ASCII
 * art, or a buggy `process.stdout.write(buf)`), the NUL makes it into our
 * log buffer, and the next `persistLogs()` call throws
 * "invalid byte sequence for encoding UTF8: 0x00". The catch handler then
 * tries to write the error message into the same broken buffer and we loop
 * on the same error forever.
 *
 * This helper sanitises one line before it enters the buffer:
 *   - strips 0x00 (NUL) bytes
 *   - replaces any remaining invalid UTF-8 sequences with U+FFFD
 *   - strips 0x07 (BEL) and 0x08 (BS) which are also control chars users
 *     never want to see in a log viewer
 */
function sanitizeLogLine(input: string): string {
  if (!input) return '';
  // Fast path — already clean.
  // eslint-disable-next-line no-control-regex
  if (!/[\u0000\u0007\u0008]/.test(input)) return input;
  return input
    .replace(/\u0000/g, '')
    .replace(/\u0007/g, '')
    .replace(/\u0008/g, '');
}

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
  const safe = sanitizeLogLine(line);
  const s = getOrCreateStream(deploymentId);
  if (s.lines.length >= 5000) s.lines.shift();
  s.lines.push(safe);
  broadcast(deploymentId, { type: 'log', line: safe, ts: new Date().toISOString() });

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
  broadcast(deploymentId, { type: 'error', message: sanitizeLogLine(message), ts: new Date().toISOString() });
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