/**
 * Billing routes (Phase 4d).
 *
 *   GET  /api/billing          — current plan + subscription state
 *   POST /api/billing/portal   — open Razorpay customer portal URL
 *   POST /api/billing/checkout — create a Razorpay subscription checkout
 *   POST /api/billing/cancel   — cancel at period end
 *   POST /api/billing/webhook  — Razorpay webhook (HMAC verified)
 *
 * These routes run in the AUTHENTICATED sub-app (parent adds requireAuth),
 * except the webhook which is unauthenticated by design (Razorpay hits it).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { loadConfig } from '@deplox/shared-config';
import { getLogger } from '@deplox/shared-logger';
import { db } from '../db/client.js';
import { users, subscriptions, invoices, billingEvents } from '../db/schema.js';

const cfg = loadConfig();
const log = getLogger().child({ component: 'billing' });

const PLAN_AMOUNT_PAISE: Record<string, number> = {
  pro: 19900,   // ₹199
  team: 99900,  // ₹999
};

const RAZORPAY_PLAN_ID: Record<string, string> = {
  pro: cfg.DEPLOX_RAZORPAY_PLAN_PRO ?? 'plan_PRO_DEPLOC',
  team: cfg.DEPLOX_RAZORPAY_PLAN_TEAM ?? 'plan_TEAM_DEPLOC',
};

// =============================================================================
// Public route registration (some sub-routes need to be public, e.g. webhook)
// =============================================================================

export function registerBillingRoutes(app: FastifyInstance): void {
  // ---- Public webhook (Razorpay calls this; signature verifies authenticity)
  app.post(
    '/api/billing/webhook',
    {
      config: { rawBody: true },
    },
    handleRazorpayWebhook,
  );
}

// =============================================================================
// Authenticated route registration (parent adds requireAuth)
// =============================================================================

export function registerAuthedBillingRoutes(app: FastifyInstance): void {
  app.get('/api/billing', getBilling);
  app.post('/api/billing/portal', openPortal);
  app.post('/api/billing/checkout', createCheckout);
  app.post('/api/billing/cancel', cancelSubscription);
}

// =============================================================================
// Handlers
// =============================================================================

async function getBilling(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = req.user!.id;
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) {
    return reply.code(404).send({ error: 'user_not_found', message: 'User not found' });
  }

  // Most recent active subscription, if any
  const subs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(5);

  const active = subs.find((s) => s.status === 'active') ?? null;

  return reply.send({
    plan: u.plan ?? 'free',
    status: u.planStatus ?? 'none',
    currentPeriodEnd: u.planRenewsAt?.toISOString() ?? active?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: u.planCancelAtPeriodEnd,
  });
}

async function openPortal(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Real implementation: create a Razorpay customer portal session and return URL.
  // For now, mock the response so the frontend works end-to-end.
  const userId = req.user!.id;
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.razorpayCustomerId) {
    return reply.code(404).send({
      error: 'no_customer',
      message: 'No Razorpay customer for this user yet. Subscribe first.',
    });
  }
  // Stub: in production, hit Razorpay's `/customers/{id}/portal` endpoint and return the URL.
  // The frontend redirect is a no-op for now.
  return reply.send({
    url: `/billing?mock_portal=1`,
  });
}

async function createCheckout(
  req: FastifyRequest<{ Body: { plan: 'pro' | 'team' } }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = req.user!.id;
  const plan = req.body?.plan ?? 'pro';
  if (plan !== 'pro' && plan !== 'team') {
    return reply.code(400).send({ error: 'invalid_plan', message: 'Plan must be pro or team' });
  }

  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) {
    return reply.code(404).send({ error: 'user_not_found', message: 'User not found' });
  }

  // Razorpay integration — call subscriptions.create with the right plan.
  // For now, return what we'd send so the frontend has a clear contract.
  //
  // Real flow (when RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set):
  //   1. Ensure customer exists: customers.create({ email, 'github_username': u.username })
  //   2. Create subscription: subscriptions.create({ plan_id, customer_notify: 1 })
  //   3. Save subscription row, return subscription.short_url
  //
  // For Phase 4d stub, return the would-be URL pattern.
  if (!cfg.DEPLOX_RAZORPAY_KEY_ID) {
    log.warn({ userId, plan }, 'razorpay not configured — returning mock checkout URL');
    return reply.send({
      url: `/billing?mock_checkout=${plan}`,
      plan,
      amount: PLAN_AMOUNT_PAISE[plan] ?? null,
      planId: RAZORPAY_PLAN_ID[plan] ?? null,
      message: 'Razorpay not yet configured. Set DEPLOX_RAZORPAY_KEY_ID + DEPLOX_RAZORPAY_KEY_SECRET + plan IDs in .env to activate.',
    });
  }

  // Real implementation placeholder:
  return reply.code(503).send({
    error: 'razorpay_not_integrated',
    message: 'Backend integration stub — wire to Razorpay SDK in Phase 4d.',
  });
}

async function cancelSubscription(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = req.user!.id;
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.razorpaySubscriptionId) {
    return reply.code(404).send({
      error: 'no_subscription',
      message: 'No active subscription',
    });
  }

  if (!cfg.DEPLOX_RAZORPAY_KEY_ID) {
    // Mock: just flip the column locally
    await db
      .update(users)
      .set({ planCancelAtPeriodEnd: true })
      .where(eq(users.id, userId));
    return reply.send({ ok: true, mocked: true });
  }

  return reply.code(503).send({
    error: 'razorpay_not_integrated',
    message: 'Backend integration stub.',
  });
}

// =============================================================================
// Razorpay webhook (public, signature-verified)
// =============================================================================

async function handleRazorpayWebhook(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const signature = req.headers['x-razorpay-signature'];
  if (typeof signature !== 'string' || !signature) {
    return reply.code(400).send({ error: 'missing_signature' });
  }

  const secret = cfg.DEPLOX_RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    log.error('RAZORPAY_WEBHOOK_SECRET not configured — refusing');
    return reply.code(503).send({ error: 'webhook_disabled' });
  }

  const raw = (req as { rawBody?: Buffer }).rawBody;
  if (!raw) {
    return reply.code(400).send({ error: 'missing_body' });
  }

  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    log.warn({ signaturePrefix: signature.slice(0, 12) }, 'razorpay signature mismatch');
    return reply.code(401).send({ error: 'invalid_signature' });
  }

  const event = (req.body ?? {}) as {
    event?: string;
    payload?: {
      subscription?: { entity?: { id: string; plan_id: string; status: string; current_start?: number; current_end?: number } };
      payment?: { entity?: { id: string; amount: number; invoice_number?: string; short_url?: string } };
    };
  };

  // Log to audit table
  await db.insert(billingEvents).values({
    source: 'razorpay_webhook',
    eventType: event.event ?? 'unknown',
    payload: event as Record<string, unknown>,
  });

  // Stub: in production, switch on event.event and update users/subscriptions/invoices.
  log.info({ event: event.event }, 'razorpay webhook received (stub handler)');
  return reply.send({ ok: true, mocked: true });
}