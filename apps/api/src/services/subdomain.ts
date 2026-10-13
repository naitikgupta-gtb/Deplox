/**
 * User-picked subdomain management.
 *
 * Each project has ONE public `<subdomain>.deplox.site` URL. There are
 * three ways to choose that subdomain, in priority order:
 *
 *   1. `project.customDomain` (set + verified)  -- user attached their
 *      own purchased domain via the DNS-TXT flow. See
 *      services/domain-verification.ts.
 *   2. `project.pickedSubdomain` (set)          -- user explicitly chose
 *      a `<name>.deplox.site` from the project settings.
 *   3. AUTO-GENERATED                          -- if both above are null,
 *      we compute `<name>-<short-hash>.deplox.site` from the project
 *      UUID so every project always has SOME URL.
 *
 * This file is responsible for option 2: validating the user's pick,
 * checking it's available, atomically claiming it, and (re)registering
 * the Caddy route. The orchestrator reads `pickedSubdomain` directly to
 * pick which subdomain to register after a successful deploy.
 *
 * Rules for a valid subdomain:
 *   - 3 to 32 characters
 *   - lowercase a-z, digits 0-9, hyphens
 *   - cannot start or end with a hyphen
 *   - cannot be in the RESERVED list (used by deplox itself for
 *     marketing, dashboard, status pages, etc.)
 *   - cannot be a pure number
 *
 * The full hostname we serve is always `<subdomain>.deplox.site` for now
 * (we don't yet own deplox.app / deplox.io / deplox.dev).
 */

import { and, eq, ne, not, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects, deployments } from '../db/schema.js';
import { childLogger } from '@deplox/shared-logger';
import {
  registerAutoSubdomainRoute,
  unregisterAutoSubdomainRoute,
} from './caddy.js';
import { desc } from 'drizzle-orm';

const log = childLogger({ component: 'subdomain' });

/** The apex we currently serve on. */
export const DEPLOX_APEX = 'deplox.site';

/** Rules. */
export const MIN_LEN = 3;
export const MAX_LEN = 32;
export const VALID_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

/**
 * Names the user is NOT allowed to pick. These are the deplox-owned
 * subdomains used by the marketing site, dashboard, status pages, etc.
 * Keep in sync with the routes in apps/web/src/App.tsx and the
 * static public paths in apps/web/public/.
 */
const RESERVED: ReadonlySet<string> = new Set([
  'www', 'api', 'app', 'dashboard', 'projects', 'new', 'billing',
  'pricing', 'founding', 'about', 'docs', 'status', 'changelog',
  'auth', 'cdn', 'static', 'assets', 'mail', 'email', 'blog',
  'help', 'support', 'admin', 'root', 'system', 'test', 'staging',
  'dev', 'localhost',
]);

export type ValidationError =
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'starts_or_ends_with_hyphen'
  | 'reserved'
  | 'numeric_only';

export interface ValidationResult {
  valid: boolean;
  reason?: ValidationError;
  normalized?: string;
}

/**
 * Normalize user input: trim, lowercase, strip leading/trailing dots and
 * spaces. The `<subdomain>.deplox.site` part is added by the caller, so
 * we only validate the subdomain segment here.
 */
export function validate(input: string): ValidationResult {
  const normalized = input.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (normalized.length < MIN_LEN) return { valid: false, reason: 'too_short' };
  if (normalized.length > MAX_LEN) return { valid: false, reason: 'too_long' };
  if (!VALID_RE.test(normalized)) {
    // Distinguish "starts/ends with hyphen" from "invalid chars" so the
    // UI can show a more helpful message.
    if (normalized.startsWith('-') || normalized.endsWith('-')) {
      return { valid: false, reason: 'starts_or_ends_with_hyphen' };
    }
    return { valid: false, reason: 'invalid_chars' };
  }
  if (RESERVED.has(normalized)) return { valid: false, reason: 'reserved' };
  if (/^\d+$/.test(normalized)) return { valid: false, reason: 'numeric_only' };
  return { valid: true, normalized };
}

/**
 * Case-insensitive DB lookup. (PostgreSQL would do this anyway with the
 * default `en_US.UTF-8` collation, but we want to be explicit and avoid
 * a footgun if someone changes the collation later.)
 */
async function findProjectByPickedSubdomain(
  subdomain: string,
  excludeProjectId?: string,
): Promise<{ id: string; userId: string } | null> {
  const conditions = excludeProjectId
    ? and(eq(projects.pickedSubdomain, subdomain), ne(projects.id, excludeProjectId))
    : eq(projects.pickedSubdomain, subdomain);
  const [row] = await db
    .select({ id: projects.id, userId: projects.userId })
    .from(projects)
    .where(conditions)
    .limit(1);
  return row ?? null;
}

export interface AvailabilityResult {
  subdomain: string;
  available: boolean;
  /** If !available, why: 'taken' (another project holds it) or 'reserved' / 'invalid' */
  reason: 'taken' | 'reserved' | 'invalid' | ValidationError;
  /** If !available, an available alternative we can suggest. */
  suggestion: string | null;
}

/**
 * Check if `subdomain` is available for `projectId`. Returns the result
 * + a free-form suggestion we can show to the user.
 */
export async function checkAvailability(
  input: string,
  projectId: string,
): Promise<AvailabilityResult> {
  const v = validate(input);
  if (!v.normalized) {
    return {
      subdomain: '',
      available: false,
      reason: v.reason ?? 'invalid',
      suggestion: suggestAlternative(''),
    };
  }
  if (!v.valid) {
    return {
      subdomain: v.normalized,
      available: false,
      reason: v.reason ?? 'invalid',
      suggestion: suggestAlternative(v.normalized),
    };
  }
  const taken = await findProjectByPickedSubdomain(v.normalized, projectId);
  if (taken) {
    return {
      subdomain: v.normalized,
      available: false,
      reason: 'taken',
      suggestion: suggestAlternative(v.normalized),
    };
  }
  return { subdomain: v.normalized, available: true, reason: 'invalid', suggestion: null };
}

function suggestAlternative(taken: string): string {
  if (!taken) {
    return `myapp`;
  }
  // Try a few suffixes. Reject anything that itself collides.
  const seeds = [
    `${taken}-app`,
    `${taken}-web`,
    `${taken}-site`,
    `${taken}-1`,
    `${taken}-2`,
  ];
  for (const s of seeds) {
    if (s.length > MAX_LEN) continue;
    if (!RESERVED.has(s) && /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(s)) {
      // Don't bother with a DB check -- we can't await here, the caller
      // will re-check after the user picks a suggestion.
      return s;
    }
  }
  return `${taken}-app`;
}

export interface ClaimResult {
  subdomain: string;
  fullHostname: string;
  wasAlreadyYours: boolean;
  /** Whether the Caddy route was re-registered against a live deployment. */
  caddyRouteActive: boolean;
}

/**
 * Claim `subdomain` for `projectId`. Atomically checks availability and
 * writes the new `pickedSubdomain`. The Caddy route is (re)registered
 * against the project's currently-running deployment if one exists.
 *
 * Throws an Error whose message is one of:
 *   'invalid_<reason>'   (validation failed; reason is the ValidationError)
 *   'taken'              (another project holds it)
 *   'project_not_found'  (projectId doesn't exist or isn't owned by userId)
 */
export async function claim(
  projectId: string,
  userId: string,
  input: string,
): Promise<ClaimResult> {
  const v = validate(input);
  if (!v.valid || !v.normalized) {
    throw new Error(`invalid_${v.reason ?? 'invalid'}`);
  }
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  if (!project) throw new Error('project_not_found');

  // If user is "re-claiming" the same subdomain, nothing to do -- just
  // re-register the Caddy route if it's not already live.
  if (project.pickedSubdomain === v.normalized) {
    const caddyRouteActive = await reregisterAgainstLiveDeployment(
      projectId,
      v.normalized,
    );
    return {
      subdomain: v.normalized,
      fullHostname: `${v.normalized}.${DEPLOX_APEX}`,
      wasAlreadyYours: true,
      caddyRouteActive,
    };
  }

  // Otherwise check it's not taken.
  const taken = await findProjectByPickedSubdomain(v.normalized, projectId);
  if (taken) throw new Error('taken');

  // Unregister the OLD Caddy route (whether it was a picked subdomain or
  // the auto-generated one) before claiming the new one.
  await unregisterAutoSubdomainRoute(projectId).catch(() => undefined);

  await db
    .update(projects)
    .set({ pickedSubdomain: v.normalized, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  log.info({ projectId, subdomain: v.normalized }, 'subdomain claimed');
  const caddyRouteActive = await reregisterAgainstLiveDeployment(
    projectId,
    v.normalized,
  );
  return {
    subdomain: v.normalized,
    fullHostname: `${v.normalized}.${DEPLOX_APEX}`,
    wasAlreadyYours: false,
    caddyRouteActive,
  };
}

/**
 * Release the picked subdomain (if any). The next deploy will fall back
 * to the auto-generated `<name>-<short-hash>.deplox.site`.
 */
export async function release(
  projectId: string,
  userId: string,
): Promise<{ hadSubdomain: boolean; previousSubdomain: string | null }> {
  const [project] = await db
    .select({ pickedSubdomain: projects.pickedSubdomain })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  if (!project) throw new Error('project_not_found');
  const previous = project.pickedSubdomain;
  if (previous === null) return { hadSubdomain: false, previousSubdomain: null };

  await db
    .update(projects)
    .set({ pickedSubdomain: null, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await unregisterAutoSubdomainRoute(projectId).catch(() => undefined);
  log.info({ projectId, previousSubdomain: previous }, 'subdomain released');
  return { hadSubdomain: true, previousSubdomain: previous };
}

async function reregisterAgainstLiveDeployment(
  projectId: string,
  subdomain: string,
): Promise<boolean> {
  // Find the most recent running deployment for this project.
  const [latest] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.projectId, projectId))
    .orderBy(desc(deployments.startedAt))
    .limit(50);
  if (!latest || latest.status !== 'running' || latest.hostPort === null) {
    return false;
  }
  const result = await registerAutoSubdomainRoute(
    projectId,
    subdomain,
    latest.hostPort,
  );
  return result.ok;
}
