/**
 * API entry point. Run with `pnpm --filter @deplox/api run dev`.
 */

import { buildServer } from './server.js';
import { loadConfig } from '@deplox/shared-config';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = await buildServer();
  await app.listen({ port: cfg.DEPLOX_API_PORT, host: '0.0.0.0' });
  app.log.info(`DEPLOX API listening on http://localhost:${cfg.DEPLOX_API_PORT}`);
  app.log.info(
    { mockDocker: cfg.DEPLOX_MOCK_DOCKER },
    `Docker provider: ${cfg.DEPLOX_MOCK_DOCKER ? 'MOCK (dev)' : 'REAL'}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('API failed to start:', err);
  process.exit(1);
});