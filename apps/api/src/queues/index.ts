/**
 * BullMQ queues. Stage 2 architecture: API enqueues, worker processes.
 *
 * Queue names follow `deplox:<verb>` so they're easy to grep in Redis.
 */

import { Queue, QueueEvents, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { loadConfig } from '@deplox/shared-config';
import type {
  BuildJobPayload,
  RollbackJobPayload,
  RunJobPayload,
  StopJobPayload,
} from '@deplox/shared-types';

const cfg = loadConfig();

const connection = new IORedis(cfg.DEPLOX_REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

export const redisConnection: ConnectionOptions = {
  host: new URL(cfg.DEPLOX_REDIS_URL).hostname,
  port: Number(new URL(cfg.DEPLOX_REDIS_URL).port || 6379),
};

export const buildQueue = new Queue<BuildJobPayload>('deplox-build', {
  connection: redisConnection,
});
export const runQueue = new Queue<RunJobPayload>('deplox-run', { connection: redisConnection });
export const stopQueue = new Queue<StopJobPayload>('deplox-stop', { connection: redisConnection });
export const rollbackQueue = new Queue<RollbackJobPayload>('deplox-rollback', {
  connection: redisConnection,
});

export const buildQueueEvents = new QueueEvents('deplox-build', {
  connection: redisConnection,
});
export const runQueueEvents = new QueueEvents('deplox-run', {
  connection: redisConnection,
});

export { connection as redis };