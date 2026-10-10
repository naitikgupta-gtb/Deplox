import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { decrypt } from '../services/encryption.js';
import { listUserRepos } from '../services/github.js';

/**
 * Authenticated route that lists the GitHub repos the current user has
 * access to. Front-end uses this on the New Project page so the user
 * can pick from a list instead of typing `owner/repo` blind.
 *
 * Returns 200 with an array (possibly empty if the user has no OAuth
 * token — the front-end falls back to a manual input in that case).
 * Returns 502 if the upstream GitHub call fails so the UI can show a
 * clear "couldn't reach GitHub, try again or type the repo" message
 * instead of silently failing.
 */
export function registerGithubReposRoute(app: FastifyInstance): void {
  app.get('/api/github/repos', { preHandler: requireAuth }, async (req, reply) => {
    const encrypted = req.user!.githubAccessTokenEncrypted;
    const accessToken = encrypted ? decrypt(encrypted) : null;
    try {
      const repos = await listUserRepos(accessToken);
      return { repos };
    } catch (err) {
      req.log.warn({ err }, 'failed to list user repos from GitHub');
      return reply.code(502).send({
        code: 'github_unreachable',
        message: "Couldn't reach GitHub. Try again, or type the repo as owner/name.",
      });
    }
  });
}
