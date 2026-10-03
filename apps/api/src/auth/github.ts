/**
 * GitHub OAuth — initiates and completes the login dance.
 *
 * For Stage 1 we keep this very small: exchange code, upsert user, mint session.
 * For Stage 3 we'll add refresh-token handling and org membership checks.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { loadConfig } from '@deplox/shared-config';
import { exchangeOAuthCode } from '../services/github.js';
import { encrypt } from '../services/encryption.js';
import {
  createSession,
  setSessionCookie,
  destroySession,
  clearSessionCookie,
  readSessionCookie,
} from './session.js';

const cfg = loadConfig();

const QuerySchema = z.object({ code: z.string().min(1), state: z.string().optional() });

export function registerAuthRoutes(app: FastifyInstance): void {
  /**
   * GET /auth/github
   * Starts the OAuth dance by redirecting to GitHub.
   * (We accept `?return_to=...` to remember where to come back.)
   */
  app.get('/auth/github', async (req, reply) => {
    const { return_to } = req.query as { return_to?: string };
    const state = Buffer.from(JSON.stringify({ returnTo: return_to ?? '/' })).toString('base64url');

    if (!cfg.DEPLOX_GITHUB_CLIENT_ID) {
      return reply.code(503).send({
        error: 'oauth-not-configured',
        message:
          'DEPLOX_GITHUB_CLIENT_ID is not configured. Set it in .env — see .env.example for steps.',
      });
    }

    const params = new URLSearchParams({
      client_id: cfg.DEPLOX_GITHUB_CLIENT_ID,
      redirect_uri: cfg.DEPLOX_GITHUB_CALLBACK_URL,
      scope: 'read:user repo',
      state,
      allow_signup: 'true',
    });
    return reply.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  /**
   * GET /auth/github/callback
   * Exchanges the code, upserts the user, mints a session cookie,
   * and redirects to the post-login destination.
   */
  app.get('/auth/github/callback', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_query',
        message: 'Missing OAuth code.',
      });
    }
    const { code, state } = parsed.data;

    let returnTo = '/';
    try {
      if (state) returnTo = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')).returnTo ?? '/';
    } catch {
      /* keep default */
    }

    try {
      const profile = await exchangeOAuthCode(
        cfg.DEPLOX_GITHUB_CLIENT_ID,
        cfg.DEPLOX_GITHUB_CLIENT_SECRET,
        code,
        cfg.DEPLOX_GITHUB_CALLBACK_URL,
      );

      // Upsert user.
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.githubId, profile.githubId))
        .limit(1);

      // Encrypt the OAuth access token so we can call GitHub on behalf of the
      // user (avoids 60-req/hour anonymous rate limit).
      const encryptedToken = encrypt(profile.accessToken);

      let userId: string;
      if (existing[0]) {
        userId = existing[0].id;
        await db
          .update(users)
          .set({
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            email: profile.email,
            githubAccessTokenEncrypted: encryptedToken,
          })
          .where(eq(users.id, userId));
      } else {
        const inserted = await db
          .insert(users)
          .values({
            githubId: profile.githubId,
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            email: profile.email,
            githubAccessTokenEncrypted: encryptedToken,
          })
          .returning({ id: users.id });
        userId = inserted[0]!.id;
      }

      const sid = await createSession(userId);
      setSessionCookie(reply, sid);

      // Redirect to the web origin (not the API origin). The SPA lives on
      // port 5173 in dev (or whatever DEPLOX_WEB_URL points to).
      const webUrl = cfg.DEPLOX_WEB_URL ?? 'http://localhost:5173';
      return reply.redirect(`${webUrl.replace(/\/$/, '')}${returnTo}`);
    } catch (err) {
      req.log.error({ err }, 'OAuth exchange failed');
      return reply.code(500).send({
        error: 'oauth_failed',
        message: 'Could not complete GitHub login. Please try again.',
      });
    }
  });

  /**
   * POST /auth/logout
   */
  app.post('/auth/logout', async (req, reply) => {
    const sid = readSessionCookie(req);
    if (sid) await destroySession(sid);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });
}