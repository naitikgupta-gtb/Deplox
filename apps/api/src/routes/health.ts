import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => ({
    ok: true,
    service: 'deplox-api',
    time: new Date().toISOString(),
  }));

  app.get('/health/ready', async (_req, reply) => {
    try {
      const { db } = await import('../db/client.js');
      await db.execute(sql`SELECT 1`);
      const { redis } = await import('../queues/index.js');
      await redis.ping();
      return { ok: true, db: 'up', redis: 'up' };
    } catch (err) {
      return reply.code(503).send({ ok: false, error: String(err) });
    }
  });
}