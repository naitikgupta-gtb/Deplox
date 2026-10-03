/**
 * Caddy admin API client.
 *
 * DEPLOX uses Caddy as a reverse proxy with on-demand TLS so that user
 * containers are reachable on their custom domains (Stage 3) with auto-issued
 * Let's Encrypt certificates.
 *
 * Caddy's admin API (https://caddyserver.com/docs/api) exposes a JSON config
 * tree. We post/delete routes by their `@id` so that registering/unregistering
 * a domain doesn't disturb other routes.
 *
 * We follow these well-formed config patches:
 *   - Adding:   POST /id/<route-id>    with the new route object
 *   - Removing: DELETE /id/<route-id>
 *
 * Per DEPLOX_SECURITY_ARCHITECTURE.md §10 — all admin requests are
 * authenticated via the API token (DEPLOX_CADDY_API_TOKEN). If Caddy is
 * unreachable (dev without docker compose), we log a warning and degrade
 * gracefully — the user still gets `localhost:<port>` URLs.
 */

import { loadConfig } from '@deplox/shared-config';
import { childLogger } from '@deplox/shared-logger';

const cfg = loadConfig();
const log = childLogger({ component: 'caddy' });

// =============================================================================
// Route shape (subset of Caddy's HTTP route config we use)
// =============================================================================

export interface CaddyRoute {
  '@id': string;
  match: ReadonlyArray<{ readonly host: ReadonlyArray<string> }>;
  handle: ReadonlyArray<{ readonly handler: string; readonly upstreams?: ReadonlyArray<{ readonly dial: string }> }>;
  terminal: boolean;
}

function routeId(projectId: string): string {
  return `deplox-domain-${projectId}`;
}

// =============================================================================
// HTTP helpers
// =============================================================================

interface AdminOpts {
  readonly method: 'POST' | 'PUT' | 'DELETE' | 'GET';
  readonly path: string;
  readonly body?: unknown;
}

interface AdminResult {
  readonly ok: boolean;
  readonly status: number;
  readonly message: string;
}

async function adminRequest(opts: AdminOpts): Promise<AdminResult> {
  const url = `${cfg.DEPLOX_CADDY_ADMIN_URL}${opts.path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (cfg.DEPLOX_CADDY_API_TOKEN) {
    headers.authorization = `Bearer ${cfg.DEPLOX_CADDY_API_TOKEN}`;
  }

  // Build fetch opts explicitly so `body` is either a string (never undefined)
  // — exactOptionalPropertyTypes rejects `body: undefined` on RequestInit.
  const fetchOpts: RequestInit = {
    method: opts.method,
    headers,
    signal: AbortSignal.timeout(5000),
  };
  if (opts.body !== undefined) {
    fetchOpts.body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOpts);
  } catch (err) {
    const message = String((err as Error).message ?? err);
    log.warn({ url, err: message }, 'caddy admin unreachable');
    return { ok: false, status: 0, message };
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    log.warn({ url, status: res.status, body: text }, 'caddy admin request failed');
    return { ok: false, status: res.status, message: text || res.statusText };
  }
  log.info({ url, status: res.status }, 'caddy admin request ok');
  return { ok: true, status: res.status, message: text };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Registers (or updates) a route for a custom domain pointing at a host port.
 *
 * Caddy's `POST /id/<route-id>` will REPLACE any existing object with that id,
 * so this is safe to call repeatedly with a new hostPort after a deploy.
 */
export async function registerDomainRoute(
  projectId: string,
  domain: string,
  hostPort: number,
): Promise<AdminResult> {
  const route: CaddyRoute = {
    '@id': routeId(projectId),
    match: [{ host: [domain] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `localhost:${hostPort}` }],
      },
    ],
    terminal: true,
  };
  return adminRequest({ method: 'POST', path: `/id/${route['@id']}`, body: route });
}

/** Removes the route for a project's custom domain (no-op if it doesn't exist). */
export async function unregisterDomainRoute(projectId: string): Promise<AdminResult> {
  return adminRequest({ method: 'DELETE', path: `/id/${routeId(projectId)}` });
}

/** Returns true if Caddy's admin API is reachable. */
export async function pingCaddy(): Promise<boolean> {
  const res = await adminRequest({ method: 'GET', path: '/config/' });
  return res.ok;
}

/**
 * On API startup, re-register Caddy routes for every currently-running
 * deployment with a custom domain. Failures here are non-fatal — Caddy may
 * not be running locally, in which case the user is still served via the
 * direct host port.
 */
export async function primeCaddyRoutes(): Promise<void> {
  // Lazy-import to avoid a circular dep with db client at module init.
  const { eq, and, isNotNull } = await import('drizzle-orm');
  const { db } = await import('../db/client.js');
  const { deployments, projects } = await import('../db/schema.js');

  const rows = await db
    .select({
      projectId: projects.id,
      customDomain: projects.customDomain,
      hostPort: deployments.hostPort,
      deploymentStatus: deployments.status,
    })
    .from(deployments)
    .innerJoin(projects, eq(projects.id, deployments.projectId))
    .where(
      and(
        eq(deployments.status, 'running'),
        isNotNull(projects.customDomain),
        isNotNull(deployments.hostPort),
      ),
    );

  log.info({ count: rows.length }, 'priming caddy routes for running deployments');
  for (const row of rows) {
    if (row.customDomain && row.hostPort) {
      const result = await registerDomainRoute(row.projectId, row.customDomain, row.hostPort);
      if (!result.ok) {
        log.warn({ projectId: row.projectId, domain: row.customDomain }, 'failed to prime caddy route');
      }
    }
  }
}