/**
 * Cookie-based session store backed by Postgres.
 *
 * Why server-side sessions instead of JWTs?
 *   - Instant revocation (logout = delete row).
 *   - No "but where do we store the long-lived refresh token?" problem.
 *   - Sessions are tiny — they're just opaque IDs; everything else lives in DB.
 *
 * Session cookie is httpOnly, sameSite=lax, secure in prod.
 */

import { randomBytes } from 'node:crypto';
import { eq, and, lt } from 'drizzle-orm';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import type { User } from '@deplox/shared-types';

const COOKIE_NAME = 'deplox.sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string): Promise<string> {
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return id;
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function loadSessionUser(sessionId: string): Promise<User | null> {
  const rows = await db
    .select({
      id: users.id,
      githubId: users.githubId,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      email: users.email,
      createdAt: users.createdAt,
      expiresAt: sessions.expiresAt,
      githubAccessTokenEncrypted: users.githubAccessTokenEncrypted,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt < new Date()) {
    await destroySession(sessionId);
    return null;
  }

  return {
    id: row.id,
    githubId: row.githubId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
    githubAccessTokenEncrypted: row.githubAccessTokenEncrypted,
  };
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

export function readSessionCookie(req: FastifyRequest): string | null {
  const c = req.cookies[COOKIE_NAME];
  return typeof c === 'string' && c.length > 0 ? c : null;
}

export { COOKIE_NAME };