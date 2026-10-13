/**
 * Custom-domain ownership verification.
 *
 * Flow (see 0005_custom_domain_verification.sql for the schema):
 *
 *   1. User sets `customDomain` on a project. The PATCH /api/projects/:id
 *      route now calls `startVerification(projectId, domain)` instead of
 *      immediately registering a Caddy route. We:
 *        - generate a 32-char random hex token
 *        - store the domain, token, customDomainVerified = false
 *        - return the TXT record the user must publish
 *
 *   2. User adds the TXT record at their DNS provider:
 *        _deplox-verify.<customDomain>   TXT   "deplox-verify=<token>"
 *
 *   3. User clicks "Verify" in the UI. The web app calls
 *      POST /api/projects/:id/custom-domain/verify. We do a DNS lookup
 *      via `dns.resolveTxt` (Node built-in, no extra dep) at
 *      `_deplox-verify.<domain>`. If any of the returned strings equals
 *      `deplox-verify=<token>`, we mark the project verified and
 *      register the Caddy route.
 *
 *   4. If the user removes the customDomain, we unregister the Caddy
 *      route and clear all four fields.
 *
 * Why bother verifying when the user has to point their own DNS at us
 * for the domain to actually serve anything? Three reasons:
 *   1. UX: it tells the user "you haven't finished setting this up".
 *   2. Abuse: prevents someone from accidentally (or maliciously)
 *      reserving a typo'd popular domain just by typing it.
 *   3. Audit: a single source of truth ("verified at <ts>") for when
 *      the user took ownership.
 *
 * Security note: the TXT value is generated server-side and never
 * leaves the API except as part of the project record returned to the
 * owning user. We never include it in public listings, search engines,
 * or webhook payloads.
 */

import { promises as dns } from 'node:dns';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { childLogger } from '@deplox/shared-logger';
import { db } from '../db/client.js';
import { projects } from '../db/schema.js';

const log = childLogger({ component: 'domain-verification' });

/** TXT record host prefix. Users publish a record at `<prefix>.<domain>`. */
export const TXT_PREFIX = '_deplox-verify';
/** TXT record value format. The token is hex (32 chars). */
export const TXT_VALUE_PREFIX = 'deplox-verify=';

/** Minimum 32 hex chars (16 bytes). Long enough that brute-forcing
 *  the verification challenge over DNS is impractical. */
function generateToken(): string {
  return randomBytes(16).toString('hex');
}

/** Build the TXT record host (e.g. `_deplox-verify.example.com`). */
export function buildTxtHost(domain: string): string {
  return `${TXT_PREFIX}.${domain}`;
}

/** Build the TXT record value for the given token. */
export function buildTxtValue(token: string): string {
  return `${TXT_VALUE_PREFIX}${token}`;
}

/** Pull the token out of a TXT value (or null if not in the right format). */
function parseTxtValue(value: string): string | null {
  if (!value.startsWith(TXT_VALUE_PREFIX)) return null;
  return value.slice(TXT_VALUE_PREFIX.length);
}

/** Coarse sanity check on a domain string before we issue challenges. */
function isValidDomainShape(domain: string): boolean {
  // Same regex the API uses in CreateProjectSchema/UpdateProjectSchema.
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}

export interface StartVerificationInput {
  projectId: string;
  userId: string;
  domain: string;
}

export interface StartVerificationResult {
  domain: string;
  txtHost: string;
  txtValue: string;
  token: string;
  alreadyVerified: boolean;
}

/**
 * Begin (or refresh) the verification flow for `domain`. Generates a fresh
 * token, stores it, and returns the TXT instructions the UI shows to the
 * user. Does NOT touch the Caddy route — that only happens after a
 * successful `checkVerification`.
 *
 * If the project already has a verified customDomain matching `domain`,
 * we return `alreadyVerified: true` and no new token — the user is done.
 */
export async function startVerification(
  input: StartVerificationInput,
): Promise<StartVerificationResult> {
  const { projectId, userId, domain } = input;
  if (!isValidDomainShape(domain)) {
    throw new Error('invalid_domain');
  }
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project || project.userId !== userId) {
    throw new Error('project_not_found');
  }
  if (
    project.customDomain === domain &&
    project.customDomainVerified === true
  ) {
    // Already verified — no need to re-issue a token.
    return {
      domain,
      txtHost: buildTxtHost(domain),
      txtValue: project.customDomainVerificationToken
        ? buildTxtValue(project.customDomainVerificationToken)
        : '',
      token: project.customDomainVerificationToken ?? '',
      alreadyVerified: true,
    };
  }
  const token = generateToken();
  await db
    .update(projects)
    .set({
      customDomain: domain,
      customDomainVerified: false,
      customDomainVerifiedAt: null,
      customDomainVerificationToken: token,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
  log.info({ projectId, domain }, 'custom-domain verification started');
  return {
    domain,
    txtHost: buildTxtHost(domain),
    txtValue: buildTxtValue(token),
    token,
    alreadyVerified: false,
  };
}

export type CheckResult =
  | { status: 'verified'; domain: string }
  | { status: 'pending'; domain: string; reason: string }
  | { status: 'no_challenge'; domain: string; reason: string };

/**
 * Look up the TXT record for the project's customDomain. If a value
 * matching the stored token is found, mark the project verified. If not,
 * return a pending status with the reason.
 *
 * Never throws on DNS errors — they're returned as a `pending` result
 * with a clear reason.
 */
export async function checkVerification(
  projectId: string,
  userId: string,
): Promise<CheckResult> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project || project.userId !== userId) {
    throw new Error('project_not_found');
  }
  if (!project.customDomain) {
    return { status: 'no_challenge', domain: '', reason: 'no_domain_set' };
  }
  if (!project.customDomainVerificationToken) {
    return {
      status: 'no_challenge',
      domain: project.customDomain,
      reason: 'no_token_issued',
    };
  }
  if (project.customDomainVerified) {
    return { status: 'verified', domain: project.customDomain };
  }

  const host = buildTxtHost(project.customDomain);
  let records: string[][];
  try {
    records = await dns.resolveTxt(host);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
    log.info({ projectId, host, code }, 'TXT lookup failed');
    return {
      status: 'pending',
      domain: project.customDomain,
      reason: code === 'ENOTFOUND' ? 'dns_not_found' : `dns_error:${code}`,
    };
  }

  // resolveTxt returns string[][] — chunks for multi-string records.
  const flat = records.map((c) => c.join(''));
  const match = flat.find(
    (v) => parseTxtValue(v) === project.customDomainVerificationToken,
  );
  if (!match) {
    return {
      status: 'pending',
      domain: project.customDomain,
      reason: 'txt_value_mismatch',
    };
  }

  // Token matches — mark verified.
  await db
    .update(projects)
    .set({
      customDomainVerified: true,
      customDomainVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
  log.info({ projectId, domain: project.customDomain }, 'custom-domain verified');
  return { status: 'verified', domain: project.customDomain };
}

/**
 * Clear all customDomain state on a project. Used both when the user
 * explicitly removes the domain and when we want to reset the flow.
 */
export async function clearCustomDomain(
  projectId: string,
  userId: string,
): Promise<{ previousDomain: string | null }> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project || project.userId !== userId) {
    throw new Error('project_not_found');
  }
  const previousDomain = project.customDomain;
  await db
    .update(projects)
    .set({
      customDomain: null,
      customDomainVerified: false,
      customDomainVerifiedAt: null,
      customDomainVerificationToken: null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
  return { previousDomain };
}
