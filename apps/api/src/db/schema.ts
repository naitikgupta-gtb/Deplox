/**
 * DEPLOX Postgres schema (Drizzle).
 *
 * Tables:
 *   users        — auth identity, sourced from GitHub OAuth
 *   sessions     — server-side session tokens (no JWTs)
 *   projects     — a GitHub repo registered with DEPLOX
 *   deployments  — one row per build/run cycle
 *   env_vars     — encrypted-at-rest env vars per project
 *
 * Per DEPLOX_SECURITY_ARCHITECTURE.md §8 — all queries are scoped by user_id
 * via the auth middleware, never trusting path parameters for ownership.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  bigint,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// =============================================================================
// users
// =============================================================================

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    githubId: bigint('github_id', { mode: 'number' }).notNull().unique(),
    username: text('username').notNull(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    email: text('email'),
    /** AES-256-GCM ciphertext. Stored so we can make authenticated GitHub
     *  calls on behalf of the user (avoids anonymous 60-req/hour rate limit). */
    githubAccessTokenEncrypted: text('github_access_token_encrypted'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    usernameIdx: uniqueIndex('users_username_uniq').on(t.username),
  }),
);

// =============================================================================
// sessions
// =============================================================================

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
  }),
);

// =============================================================================
// projects
// =============================================================================

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    githubRepoFullName: text('github_repo_full_name').notNull(), // "owner/repo"
    githubRepoUrl: text('github_repo_url').notNull(),
    /** AES-256-GCM ciphertext; null until first deployment. */
    githubAccessTokenEncrypted: text('github_access_token_encrypted'),
    defaultBranch: text('default_branch').notNull().default('main'),
    framework: text('framework'), // null until first deployment detects it
    customDomain: text('custom_domain'),
    /** Random secret GitHub uses to sign webhook payloads (X-Hub-Signature-256). */
    webhookSecret: text('webhook_secret'),
    /** Whether the project auto-deploys on push to the default branch. */
    autoDeploy: boolean('auto_deploy').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    customDomainIdx: uniqueIndex('projects_custom_domain_uniq').on(t.customDomain),
    userIdx: index('projects_user_idx').on(t.userId),
  }),
);

// =============================================================================
// deployments
// =============================================================================

export const deployments = pgTable(
  'deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    commitSha: text('commit_sha').notNull(),
    commitMessage: text('commit_message'),
    commitAuthor: text('commit_author'),
    status: text('status').notNull().default('queued'),
    framework: text('framework'),
    containerId: text('container_id'),
    hostPort: integer('host_port'),
    imageTag: text('image_tag'),
    publicUrl: text('public_url'),
    errorMessage: text('error_message'),
    /** Newline-delimited, already-redacted build/runtime log output. */
    buildLogs: text('build_logs'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    projectIdx: index('deployments_project_idx').on(t.projectId),
    statusIdx: index('deployments_status_idx').on(t.status),
  }),
);

// =============================================================================
// env_vars
// =============================================================================

export const envVars = pgTable(
  'env_vars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** AES-256-GCM ciphertext (iv||tag||ct, base64). */
    encryptedValue: text('encrypted_value').notNull(),
    isSecret: boolean('is_secret').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    projectKeyUniq: uniqueIndex('env_vars_project_key_uniq').on(t.projectId, t.key),
  }),
);

// =============================================================================
// type exports
// =============================================================================

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type DeploymentRow = typeof deployments.$inferSelect;
export type NewDeploymentRow = typeof deployments.$inferInsert;
export type EnvVarRow = typeof envVars.$inferSelect;
export type NewEnvVarRow = typeof envVars.$inferInsert;