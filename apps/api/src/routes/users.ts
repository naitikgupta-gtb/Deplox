import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/middleware.js';

export function registerUserRoutes(app: FastifyInstance): void {
  app.get('/api/me', { preHandler: requireAuth }, async (req) => {
    return req.user;
  });
}