/**
 * Fastify middleware that loads the current user from the session cookie
 * and rejects unauthenticated requests with 401.
 *
 * Per DEPLOX_SECURITY_ARCHITECTURE.md §8: "All database queries strictly
 * scoped to authorized user IDs." — this middleware is the single place
 * where `req.user` is established; downstream handlers always derive their
 * ownership from `req.user.id`, never from path params.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import type { User } from '@deplox/shared-types';
import { readSessionCookie } from './session.js';
import { loadSessionUser } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

export async function attachUser(req: FastifyRequest): Promise<void> {
  const sid = readSessionCookie(req);
  if (!sid) return;
  const user = await loadSessionUser(sid);
  if (user) req.user = user;
}

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!req.user) {
    reply.code(401).send({ error: 'unauthenticated', message: 'Login required.' });
  }
}

/** Re-fetches the current user record (used by tests / hot-reload). */
export async function reloadUser(userId: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    githubId: row.githubId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  };
}