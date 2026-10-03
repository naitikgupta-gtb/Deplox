/**
 * Worker entry point.
 *
 * In Stage 1+2 the API process itself drives the orchestrator inline (see
 * routes/deployments.ts POST handler), so this worker is mostly a thin
 * BullMQ listener that re-runs jobs that landed on the queue from external
 * producers (webhooks, cron, future api replicas).
 *
 * Run with `pnpm --filter @deplox/api run worker`.
 */

import { Worker, type Job } from 'bullmq';
import { loadConfig } from '@deplox/shared-config';
import { getLogger } from '@deplox/shared-logger';
import { redisConnection } from './queues/index.js';
import {
  runDeployment,
  stopDeployment,
  rollbackDeployment,
} from './services/deployment-orchestrator.js';
import type {
  BuildJobPayload,
  RollbackJobPayload,
  RunJobPayload,
  StopJobPayload,
} from '@deplox/shared-types';

const log = getLogger().child({ component: 'worker' });
const cfg = loadConfig();

const buildWorker = new Worker<BuildJobPayload>(
  'deplox-build',
  async (job: Job<BuildJobPayload>) => {
    log.info({ deploymentId: job.data.deploymentId }, 'build job picked up');
    await runDeployment(job.data.deploymentId);
  },
  { connection: redisConnection, concurrency: cfg.DEPLOX_BUILD_CPU },
);

const runWorker = new Worker<RunJobPayload>(
  'deplox-run',
  async (job: Job<RunJobPayload>) => {
    log.info({ deploymentId: job.data.deploymentId }, 'run job picked up');
    // Inline orchestration already covers this in Stage 1+2. Kept for Stage 3
    // when we move runs off the API process.
  },
  { connection: redisConnection, concurrency: cfg.DEPLOX_BUILD_CPU },
);

const stopWorker = new Worker<StopJobPayload>(
  'deplox-stop',
  async (job: Job<StopJobPayload>) => {
    log.info({ deploymentId: job.data.deploymentId }, 'stop job picked up');
    await stopDeployment(job.data.deploymentId);
  },
  { connection: redisConnection, concurrency: 2 },
);

const rollbackWorker = new Worker<RollbackJobPayload>(
  'deplox-rollback',
  async (job: Job<RollbackJobPayload>) => {
    log.info({ deploymentId: job.data.deploymentId }, 'rollback job picked up');
    await rollbackDeployment(job.data.projectId, job.data.targetDeploymentId);
  },
  { connection: redisConnection, concurrency: 2 },
);

for (const w of [buildWorker, runWorker, stopWorker, rollbackWorker]) {
  w.on('failed', (job, e) => {
    log.error({ jobId: job?.id, err: e }, 'job failed');
  });
}

log.info('DEPLOX worker ready');