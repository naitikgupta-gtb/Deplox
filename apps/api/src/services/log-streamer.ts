/**
 * Per-deployment in-memory log buffer + SSE fan-out.
 *
 * Two responsibilities:
 *   1. Append build/runtime log lines to a per-deployment buffer
 *      (also persisted to `deployments.build_logs` on completion).
 *   2. Stream those lines to any currently-attached SSE client.
 *
 * For Stage 2 we keep things in-memory + DB; a future Stage 3 deployment can
 * promote this to Redis pub/sub for horizontal scale.
 */

import type { DeploymentStatus, LogStreamEvent } from '@deplox/shared-types';

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

export function setStatus(deploymentId: string, status: DeploymentStatus): void {
  const s = getOrCreateStream(deploymentId);
  s.status = status;
  broadcast(deploymentId, { type: 'status', status, ts: new Date().toISOString() });
}

export function appendLog(deploymentId: string, line: string): void {
  const s = getOrCreateStream(deploymentId);
  // Cap in-memory buffer to last 5,000 lines.
  if (s.lines.length >= 5000) s.lines.shift();
  s.lines.push(line);
  broadcast(deploymentId, { type: 'log', line, ts: new Date().toISOString() });
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