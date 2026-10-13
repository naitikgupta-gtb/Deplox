/**
 * Public showcase endpoint.
 *
 * Returns only the projects that have `publicly_listed = true`. Used by
 * the marketing landing page to render the "Live on deplox" strip. We
 * never auto-include projects; the owner must explicitly opt-in via
 * PATCH /api/projects/:id { publiclyListed: true }.
 *
 * NO AUTH REQUIRED. We deliberately return only a small, fixed shape
 * (project name + deplox.site subdomain + framework) so callers can't
 * fingerprint users from this endpoint. Custom domains and verified
 * state are NOT included -- the public URL only goes to `.deplox.site`
 * hosts that the deplox owner has self-curated.
 *
 * If no projects are opted in, returns `{ apps: [] }` so the landing
 * page can render a generic "no public projects" message instead of
 * showing fake entries.
 */

import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects, deployments } from '../db/schema.js';

export interface PublicShowcaseApp {
  name: string;
  host: string;
  url: string;
  framework: string | null;
}

export function registerPublicShowcaseRoute(app: FastifyInstance): void {
  app.get('/api/public/showcase-projects', async () => {
    // Pick the most-recently-listed publicly_listed project, with a
    // sub-query for the most recent deployment's publicUrl so we know
    // whether the project is actually live right now.
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        pickedSubdomain: projects.pickedSubdomain,
        framework: projects.framework,
        publicUrl: deployments.publicUrl,
        deploymentStatus: deployments.status,
      })
      .from(projects)
      .leftJoin(
        deployments,
        and(
          eq(deployments.projectId, projects.id),
          eq(deployments.status, 'running'),
        ),
      )
      .where(eq(projects.publiclyListed, true))
      .orderBy(desc(projects.updatedAt))
      .limit(20);

    // Only include projects that have a *running* deployment with a
    // deplox.site publicUrl. A publicly_listed project that has never
    // been deployed yet (or whose deployment failed) does NOT belong on
    // the marketing page -- showing it would 502 visitors.
    const apps: PublicShowcaseApp[] = [];
    for (const r of rows) {
      if (!r.publicUrl) continue;
      if (!r.publicUrl.endsWith('.deplox.site')) continue;
      // strip "https://" and trailing slash for the display host
      const host = r.publicUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      apps.push({
        name: r.name,
        host,
        url: r.publicUrl,
        framework: r.framework,
      });
    }
    return { apps };
  });
}
