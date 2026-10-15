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

// Separate route ID for the auto-generated `*.deplox.site` subdomain that
// every running deployment gets by default (e.g. `velvet-brew.deplox.site`).
// Using a distinct id lets a project have BOTH a custom domain AND the
// deplox.site subdomain live at the same time — important so users can
// share the deplox.site URL while they finish pointing a real domain.
function autoRouteId(projectId: string): string {
  return `deplox-auto-${projectId}`;
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

/**
 * Find the routes-array indexes of every route with the given @id, in array
 * order. Returns [] if not present.
 *
 * Why plural: prior versions of this function returned only the FIRST match
 * via `findIndex`, which meant that if an earlier run of the priming loop
 * had left duplicate `@id` entries in Caddy (e.g. because a previous
 * version of `insertRouteAtFront` re-POSTed before the prior DELETE
 * committed), the duplicate survived. Once multiple routes share an @id,
 * Caddy's match logic still picks the first one in array order — which can
 * shadow later routes that the user expected to match. `unregisterAuto*` and
 * `purgeAllDeploxRoutes` use this function to find and remove every copy.
 */
async function findRouteIndexes(id: string): Promise<number[]> {
  const list = await adminRequest({
    method: 'GET',
    path: '/config/apps/http/servers/srv0/routes/',
  });
  if (!list.ok) return [];
  let routes: Array<{ '@id'?: string }>;
  try {
    routes = JSON.parse(list.message) as Array<{ '@id'?: string }>;
  } catch {
    return [];
  }
  const out: number[] = [];
  routes.forEach((r, i) => {
    if (r['@id'] === id) out.push(i);
  });
  return out;
}

/** Backwards-compatible single-index lookup. Returns the first match or null. */
async function findRouteIndex(id: string): Promise<number | null> {
  const all = await findRouteIndexes(id);
  return all.length > 0 ? all[0]! : null;
}

/**
 * Delete every deplox-managed route (id starting with `deplox-`) from the
 * Caddy routes array, in reverse order so the indexes we collect up front
 * stay valid as we DELETE. The bare catch-all (no @id) is preserved.
 *
 * Called at the top of `primeCaddyRoutes` to guarantee a clean slate — the
 * previous behavior only deleted routes that already existed with the
 * project's @id, which left orphans from earlier buggy runs and led to
 * "subdomain opens the main app" symptoms on the user side.
 */
async function purgeAllDeploxRoutes(): Promise<number> {
  const list = await adminRequest({
    method: 'GET',
    path: '/config/apps/http/servers/srv0/routes/',
  });
  if (!list.ok) return 0;
  let routes: Array<{ '@id'?: string }>;
  try {
    routes = JSON.parse(list.message) as Array<{ '@id'?: string }>;
  } catch {
    return 0;
  }
  const idxs: number[] = [];
  routes.forEach((r, i) => {
    if (typeof r['@id'] === 'string' && r['@id'].startsWith('deplox-')) {
      idxs.push(i);
    }
  });
  for (const i of idxs.reverse()) {
    const del = await adminRequest({
      method: 'DELETE',
      path: `/config/apps/http/servers/srv0/routes/${i}`,
    });
    if (!del.ok) {
      log.warn({ idx: i, status: del.status }, 'failed to delete duplicate deplox route during purge');
    }
  }
  return idxs.length;
}

/**
 * The catch-all route for `deplox.site` itself (the marketing page and
 * dashboard) — the one defined in the Caddyfile as `:8000 { reverse_proxy
 * host.docker.internal:5173 }`. It has no `@id` and no host matcher, so it
 * greedily serves every request on :8000 that no more-specific route
 * matched. We re-add it from the API in case a previous `primeCaddyRoutes`
 * run (or a stale Caddy admin state) lost it — without it, `deplox.site`
 * returns 0 bytes and the dashboard 502s.
 *
 * Idempotent: skips the POST if a catch-all with the same upstream is
 * already present.
 */
async function ensureDeploxSiteCatchAll(): Promise<boolean> {
  const desiredUpstream = 'host.docker.internal:5173';
  const list = await adminRequest({
    method: 'GET',
    path: '/config/apps/http/servers/srv0/routes/',
  });
  if (!list.ok) return false;
  let current: Array<Record<string, unknown>>;
  try {
    current = JSON.parse(list.message) as Array<Record<string, unknown>>;
  } catch {
    return false;
  }
  const exists = current.some((r) => {
    if (r['@id']) return false;
    if (!Array.isArray(r.handle)) return false;
    const h = r.handle[0] as Record<string, unknown> | undefined;
    if (!h || h.handler !== 'reverse_proxy') return false;
    const ups = h.upstreams as Array<{ dial?: string }> | undefined;
    return Array.isArray(ups) && ups[0]?.dial === desiredUpstream;
  });
  if (exists) return true;
  const reAdd = await adminRequest({
    method: 'POST',
    path: '/config/apps/http/servers/srv0/routes/',
    body: {
      handle: [
        {
          handler: 'reverse_proxy',
          upstreams: [{ dial: desiredUpstream }],
        },
      ],
      terminal: true,
    },
  });
  if (reAdd.ok) {
    log.info('re-added deplox.site catch-all route (forwards to Vite on 5173)');
  }
  return reAdd.ok;
}

/**
 * Insert a route at the front of the routes array. Critical: Caddy evaluates
 * routes in array order and does NOT auto-reorder by specificity. The
 * catch-all (no matcher, defined in the Caddyfile) is at index 0, so any
 * route we POST-appends ends up AFTER it and never gets matched.
 *
 * Two Caddy API quirks shape the implementation:
 *   - PUT /routes/ (with trailing slash) returns 409 "key already exists"
 *     because Caddy treats it as "create new key under routes" rather than
 *     "replace the whole array".
 *   - PUT /routes (no trailing slash) also 409s in newer Caddy versions.
 *   The reliable workaround: POST the new route (appends at end), DELETE
 *   index 0 (which is the bare catch-all route), then POST the catch-all
 *   back so it lands at the end. Per-hostname routes end up at the front.
 *
 * Identifies the catch-all as "the route at index 0 with no @id" — robust
 * because nothing else in our flow produces a route without an @id.
 */
async function insertRouteAtFront(route: CaddyRoute): Promise<boolean> {
  // 1) Drop EVERY existing route with the same @id so the new port / host
  //    wins. We must delete in reverse order to keep the indexes stable.
  //    A prior version of this function only deleted the first match, which
  //    left orphan duplicates from earlier buggy runs and shadowed later
  //    routes (see findRouteIndexes for the full story).
  const existingIdxs = (await findRouteIndexes(route['@id'])).reverse();
  for (const idx of existingIdxs) {
    const del = await adminRequest({
      method: 'DELETE',
      path: `/config/apps/http/servers/srv0/routes/${idx}`,
    });
    if (!del.ok) return false;
  }

  // 2) Append the new route (POST /routes/ is the documented append path).
  const post = await adminRequest({
    method: 'POST',
    path: '/config/apps/http/servers/srv0/routes/',
    body: route,
  });
  if (!post.ok) return false;

  // 3) Find and DELETE every bare catch-all route (no @id, no match). It is
  //    possible to have more than one of these:
  //      - the Caddyfile default `:8000 { reverse_proxy ... }` (no @id)
  //      - ensureDeploxSiteCatchAll()'s main-app route (no @id, 5173)
  //      - any leftover no-@id route from a prior buggy run
  //    A previous version of this function only handled the first one, which
  //    silently left the new per-host route sandwiched between two
  //    catch-alls and the second catch-all kept eating the request.
  const after = await adminRequest({
    method: 'GET',
    path: '/config/apps/http/servers/srv0/routes/',
  });
  if (!after.ok) return true; // route is registered, we just can't reorder
  let current: Array<Record<string, unknown>>;
  try {
    current = JSON.parse(after.message) as Array<Record<string, unknown>>;
  } catch {
    return true;
  }
  // Collect every catch-all (no @id) and capture their bodies BEFORE we mutate.
  const catchAllIdxsAsc: number[] = [];
  for (let i = 0; i < current.length; i++) {
    const route = current[i];
    if (route && !route['@id']) catchAllIdxsAsc.push(i);
  }
  if (catchAllIdxsAsc.length === 0) return true; // nothing to reorder
  const catchAlls = catchAllIdxsAsc.map((i) => current[i]).filter((r): r is Record<string, unknown> => r !== undefined);
  // Delete in REVERSE so the earlier indexes stay valid as we go.
  for (const idx of catchAllIdxsAsc.slice().reverse()) {
    const delCatchAll = await adminRequest({
      method: 'DELETE',
      path: `/config/apps/http/servers/srv0/routes/${idx}`,
    });
    if (!delCatchAll.ok) return true;
  }
  // Re-add every catch-all (in their original relative order) at the END
  // of the routes array so the new per-host route lands before all of them.
  for (const ca of catchAlls) {
    const reAdd = await adminRequest({
      method: 'POST',
      path: '/config/apps/http/servers/srv0/routes/',
      body: ca,
    });
    if (!reAdd.ok) return false;
  }
  // NOTE on persistence: runtime routes survive a Caddy container restart
  // because of two infra-level settings, not because we manually save here:
  //   1. infra/caddy/Caddyfile + `caddy run --resume` in docker-compose.yml
  //      makes Caddy reload /config/caddy/autosave.json on startup.
  //   2. CADDY_CONFIG_SAVE_INTERVAL=10s (set on the caddy service in
  //      docker-compose.yml) makes Caddy write the running config — including
  //      runtime-added routes — to autosave.json every 10s and on graceful
  //      shutdown.
  // We previously tried `POST /load/?preserve=1` here, but it doesn't
  // actually persist runtime-added routes and instead mutates the in-memory
  // admin binding (it reloads config from disk into the running process,
  // which on Caddy 2.8 changes admin from `0.0.0.0:2019` to `localhost:2019`
  // and breaks API → Caddy connectivity). Autosave handles it correctly.
  return true;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Registers a route for a custom domain pointing at a host port.
 *
 * Implementation: inserts the route at index 0 of the routes array so it
 * wins over the bare `:8000` catch-all that the Caddyfile defines. See
 * insertRouteAtFront for why we can't just POST (Caddy evaluates routes
 * in array order without auto-reordering).
 *
 * Dial uses `host.docker.internal:<port>` because Caddy runs inside a
 * container; `localhost:<port>` would point at the Caddy container's own
 * loopback, not the host's port where the deplox container is bound.
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
        upstreams: [{ dial: `host.docker.internal:${hostPort}` }],
      },
    ],
    terminal: true,
  };
  const ok = await insertRouteAtFront(route);
  return ok
    ? { ok: true, status: 200, message: 'route registered at front of routes array' }
    : { ok: false, status: 0, message: 'failed to insert route at front of routes array' };
}

/** Removes the route for a project's custom domain (no-op if it doesn't exist). */
export async function unregisterDomainRoute(projectId: string): Promise<AdminResult> {
  const idx = await findRouteIndex(routeId(projectId));
  if (idx === null) return { ok: true, status: 204, message: 'route not present, nothing to do' };
  return adminRequest({
    method: 'DELETE',
    path: `/config/apps/http/servers/srv0/routes/${idx}`,
  });
}

/**
 * Registers the auto-generated `*.deplox.site` subdomain route for a project.
 * Called on every successful deploy so users always have a publicly
 * reachable URL even before they wire up a custom domain.
 *
 * Cloudflare Tunnel's wildcard ingress (see ~/.cloudflared/config.yml) means
 * ANY `<anything>.deplox.site` request is already forwarded to Caddy :8000.
 * All we need to do is add the per-hostname reverse-proxy route here.
 *
 * Inserted at the front of the array to win over the `:8000` catch-all.
 *
 * Dial uses `host.docker.internal:<port>` because Caddy runs inside a
 * container; `localhost` would resolve to the Caddy container itself.
 */
export async function registerAutoSubdomainRoute(
  projectId: string,
  subdomain: string,
  hostPort: number,
): Promise<AdminResult> {
  const route: CaddyRoute = {
    '@id': autoRouteId(projectId),
    match: [{ host: [subdomain] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `host.docker.internal:${hostPort}` }],
      },
    ],
    terminal: true,
  };
  const ok = await insertRouteAtFront(route);
  return ok
    ? { ok: true, status: 200, message: 'auto-subdomain route registered at front of routes array' }
    : { ok: false, status: 0, message: 'failed to insert auto-subdomain route at front of routes array' };
}

/** Removes the auto-subdomain route for a project. */
export async function unregisterAutoSubdomainRoute(projectId: string): Promise<AdminResult> {
  const idx = await findRouteIndex(autoRouteId(projectId));
  if (idx === null) return { ok: true, status: 204, message: 'route not present, nothing to do' };
  return adminRequest({
    method: 'DELETE',
    path: `/config/apps/http/servers/srv0/routes/${idx}`,
  });
}

/** Returns true if Caddy's admin API is reachable. */
export async function pingCaddy(): Promise<boolean> {
  const res = await adminRequest({ method: 'GET', path: '/config/' });
  return res.ok;
}

/**
 * On API startup, re-register Caddy routes for every currently-running
 * deployment. This covers BOTH the custom domain (if any) AND the
 * auto-generated `*.deplox.site` subdomain that every deployment gets by
 * default. Failures here are non-fatal — Caddy may not be running locally,
 * in which case the user is still served via the direct host port.
 *
 * Also backfills `deployments.public_url` for running rows that still
 * point at `http://localhost:<port>` (pre-auto-subdomain deployments).
 * One-time migration so the dashboard immediately shows the public URL
 * without requiring a redeploy.
 */
export async function primeCaddyRoutes(): Promise<void> {
  // Lazy-import to avoid a circular dep with db client at module init.
  const { eq, and, isNotNull } = await import('drizzle-orm');
  const { db } = await import('../db/client.js');
  const { deployments, projects } = await import('../db/schema.js');
  const { buildAutoSubdomain } = await import('./deployment-orchestrator.js');

  // Start from a clean slate: a prior version of `insertRouteAtFront` could
  // leave duplicate `@id` entries behind if a priming run was interrupted
  // mid-loop, and Caddy then matches only the first one — so a subdomain
  // would silently fall through to the catch-all and serve the deplox
  // main app. Purging every `deplox-*` route here is cheap (one GET, a
  // handful of DELETEs) and gives the loop below a clean array to fill.
  const purged = await purgeAllDeploxRoutes();
  if (purged > 0) {
    log.info({ purged }, 'purged stale deplox routes before priming');
  }

  const rows = await db
    .select({
      deploymentId: deployments.id,
      projectId: projects.id,
      projectName: projects.name,
      customDomain: projects.customDomain,
      pickedSubdomain: projects.pickedSubdomain,
      hostPort: deployments.hostPort,
      publicUrl: deployments.publicUrl,
      deploymentStatus: deployments.status,
    })
    .from(deployments)
    .innerJoin(projects, eq(projects.id, deployments.projectId))
    .where(
      and(
        eq(deployments.status, 'running'),
        isNotNull(deployments.hostPort),
      ),
    );

  log.info({ count: rows.length }, 'priming caddy routes for running deployments');
  for (const row of rows) {
    if (!row.hostPort) continue;

    // 1) Custom domain (if any) — keep its existing route registered.
    if (row.customDomain) {
      const result = await registerDomainRoute(row.projectId, row.customDomain, row.hostPort);
      if (!result.ok) {
        log.warn({ projectId: row.projectId, domain: row.customDomain }, 'failed to prime custom-domain caddy route');
      }
    }

    // 2) The deplox.site subdomain. If the user picked a custom
    //    <name>.deplox.site, use it; otherwise fall back to the
    //    auto-generated <slug>-<acronym>.deplox.site form. We don't run
    //    the DB collision check at startup (it's a hot path); if there
    //    is a collision the user just gets two routes pointing at the
    //    same Caddy listener — first match wins, last-deploy-wins-style.
    //    The orchestrator's collision check kicks in on the next deploy.
    const subdomain = row.pickedSubdomain
      ? row.pickedSubdomain
      : buildAutoSubdomain(row.projectId, row.projectName);
    const result = await registerAutoSubdomainRoute(row.projectId, subdomain, row.hostPort);
    if (!result.ok) {
      log.warn({ projectId: row.projectId, subdomain }, 'failed to prime auto-subdomain caddy route');
    }

    // 3) Backfill public_url: any running deployment still pointing at
    //    http://localhost:<port> OR at the old long-form auto subdomain
    //    (8-char id suffix) gets upgraded to the new short form. The
    //    custom-domain branch is left alone (its URL was correct already).
    const shortUrl = `https://${subdomain}`;
    const isOldLongForm = row.publicUrl?.endsWith('.deplox.site')
      && row.publicUrl !== shortUrl
      && !row.customDomain;
    if (
      !row.customDomain
      && row.publicUrl
      && (row.publicUrl.startsWith('http://localhost:') || isOldLongForm)
    ) {
      await db
        .update(deployments)
        .set({ publicUrl: shortUrl })
        .where(eq(deployments.id, row.deploymentId));
      log.info({ deploymentId: row.deploymentId, newUrl: shortUrl }, 'backfilled public_url with auto subdomain');
    }
  }

  // 4) Ensure the `deplox.site` catch-all (no @id, no host matcher) is
  //    present. Without it, the main domain and dashboard return 0 bytes
  //    because no specific route matches the request. The catch-all defined
  //    in the Caddyfile should normally survive, but earlier
  //    insertRouteAtFront reordering + auto-save timing could lose it; this
  //    is a cheap safety net on every API startup.
  await ensureDeploxSiteCatchAll();
}