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
  jsonb,
  primaryKey,
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
    // ---- billing columns (migration 0004) ----
    plan: text('plan').notNull().default('free'),
    planStatus: text('plan_status').notNull().default('none'),
    planRenewsAt: timestamp('plan_renews_at', { withTimezone: true }),
    planCancelAtPeriodEnd: boolean('plan_cancel_at_period_end').notNull().default(false),
    razorpayCustomerId: text('razorpay_customer_id'),
    razorpaySubscriptionId: text('razorpay_subscription_id'),
    isFoundingMember: boolean('is_founding_member').notNull().default(false),
    foundingSlotNumber: integer('founding_slot_number'),
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

// =============================================================================
// subscriptions (migration 0004)
// =============================================================================

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    razorpaySubscriptionId: text('razorpay_subscription_id').notNull().unique(),
    razorpayPlanId: text('razorpay_plan_id').notNull(),
    plan: text('plan').notNull(), // 'pro' | 'team'
    status: text('status').notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    amountPaise: integer('amount_paise').notNull(),
    currency: text('currency').notNull().default('INR'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('subscriptions_user_idx').on(t.userId),
    statusIdx: index('subscriptions_status_idx').on(t.status),
  }),
);

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type NewSubscriptionRow = typeof subscriptions.$inferInsert;

// =============================================================================
// invoices (migration 0004)
// =============================================================================

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
    razorpayInvoiceId: text('razorpay_invoice_id').unique(),
    amountPaise: integer('amount_paise').notNull(),
    gstPaise: integer('gst_paise').notNull(),
    totalPaise: integer('total_paise').notNull(),
    status: text('status').notNull(),
    invoiceUrl: text('invoice_url'),
    invoiceNumber: text('invoice_number'),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('invoices_user_idx').on(t.userId),
  }),
);

export type InvoiceRow = typeof invoices.$inferSelect;
export type NewInvoiceRow = typeof invoices.$inferInsert;

// =============================================================================
// founding_members (migration 0004)
// =============================================================================

export const foundingMembers = pgTable(
  'founding_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    githubUsername: text('github_username').notNull(),
    useCase: text('use_case').notNull(),
    slotNumber: integer('slot_number').notNull().unique(),
    status: text('status').notNull().default('pending'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).defaultNow().notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    freeUntil: timestamp('free_until', { withTimezone: true }).notNull(),
  },
  (t) => ({
    emailIdx: index('founding_members_email_idx').on(t.email),
    userIdx: index('founding_members_user_idx').on(t.userId),
    statusIdx: index('founding_members_status_idx').on(t.status),
  }),
);

export type FoundingMemberRow = typeof foundingMembers.$inferSelect;
export type NewFoundingMemberRow = typeof foundingMembers.$inferInsert;

// =============================================================================
// billing_events (migration 0004) — append-only audit log
// =============================================================================

export const billingEvents = pgTable(
  'billing_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    source: text('source').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('billing_events_user_idx').on(t.userId),
    typeIdx: index('billing_events_type_idx').on(t.eventType),
  }),
);

export type BillingEventRow = typeof billingEvents.$inferSelect;
export type NewBillingEventRow = typeof billingEvents.$inferInsert;