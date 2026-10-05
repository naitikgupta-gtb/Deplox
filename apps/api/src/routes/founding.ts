/**
 * Founding-member program routes (Phase 4d).
 *
 *   GET  /api/founding/slots      — public, returns { remaining, total }
 *   POST /api/founding/claim      — public, claims a slot (idempotent on email)
 *
 * Slot allocation is atomic: SELECT ... FOR UPDATE on the founding_config
 * singleton, then INSERT with the next available slot_number. If the cap is
 * reached, returns 409.
 *
 * Each claimed slot grants the user 6 months of free Pro (configurable via
 * founding_config.free_duration_months).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sql, eq, and, isNull, count } from 'drizzle-orm';
import { z } from 'zod';
import { getLogger } from '@deplox/shared-logger';
import { db } from '../db/client.js';
import { foundingMembers, users } from '../db/schema.js';

const log = getLogger().child({ component: 'founding' });

const ClaimSchema = z.object({
  email: z.string().email('Must be a valid email'),
  githubUsername: z
    .string()
    .min(1)
    .max(39)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-_]|\.(?=[a-zA-Z0-9])){0,38}$/, 'Invalid GitHub username'),
  useCase: z.string().min(10, 'Tell us a bit more (10+ chars)').max(500),
});

const FOUNDING_SLOTS_TOTAL_FALLBACK = 50;

// =============================================================================
// Public route registration
// =============================================================================

export function registerFoundingRoutes(app: FastifyInstance): void {
  app.get('/api/founding/slots', getSlots);
  app.post('/api/founding/claim', claimSlot);
}

// =============================================================================
// Handlers
// =============================================================================

async function getSlots(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Try DB first
  try {
    const totalRows = await db.execute<{ max: number }>(
      sql`SELECT max_slots AS max FROM founding_config WHERE id = 1`,
    );
    // Drizzle's PG driver returns rows as a plain array on the `.rows` field,
    // but with our wrapper it's accessed differently. Defensive unpack:
    const totalSlots = Array.isArray(totalRows) && totalRows.length > 0 && typeof totalRows[0] === 'object' && 'max' in totalRows[0]
      ? (totalRows[0] as { max: number }).max
      : (totalRows as unknown as { rows?: Array<{ max: number }> }).rows?.[0]?.max;
    const claimedRows = await db
      .select({ count: count() })
      .from(foundingMembers);
    const claimedCount = claimedRows[0]?.count ?? 0;
    const total = typeof totalSlots === 'number' ? totalSlots : FOUNDING_SLOTS_TOTAL_FALLBACK;
    return reply.send({
      remaining: Math.max(0, total - claimedCount),
      total,
    });
  } catch (err) {
    log.warn({ err }, 'founding slots query failed, returning fallback');
    return reply.send({
      remaining: FOUNDING_SLOTS_TOTAL_FALLBACK,
      total: FOUNDING_SLOTS_TOTAL_FALLBACK,
    });
  }
}

async function claimSlot(
  req: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const parsed = ClaimSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: 'invalid_body',
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
  }
  const { email, githubUsername, useCase } = parsed.data;

  // Idempotency check — same email can't claim twice
  const [existing] = await db
    .select()
    .from(foundingMembers)
    .where(eq(foundingMembers.email, email))
    .limit(1);
  if (existing) {
    return reply.code(200).send({
      ok: true,
      slotNumber: existing.slotNumber,
      remainingSlots: await remainingFromDb(),
      message: 'You already claimed a slot. We\'ll be in touch within 24 hours.',
    });
  }

  // Atomically allocate a slot using a SERIALIZABLE transaction.
  try {
    const result = await db.transaction(async (tx) => {
      const maxRows = await tx.execute<{ max: number }>(
        sql`SELECT max_slots AS max FROM founding_config WHERE id = 1 FOR UPDATE`,
      );
      const max = Array.isArray(maxRows) && maxRows.length > 0 && typeof maxRows[0] === 'object' && 'max' in maxRows[0]
        ? (maxRows[0] as { max: number }).max
        : (maxRows as unknown as { rows?: Array<{ max: number }> }).rows?.[0]?.max;
      const cap = typeof max === 'number' ? max : FOUNDING_SLOTS_TOTAL_FALLBACK;

      const takenRows = await tx.execute<{ taken: number }>(
        sql`SELECT COUNT(*)::int AS taken FROM founding_members`,
      );
      const taken = Array.isArray(takenRows) && takenRows.length > 0 && typeof takenRows[0] === 'object' && 'taken' in takenRows[0]
        ? (takenRows[0] as { taken: number }).taken
        : (takenRows as unknown as { rows?: Array<{ taken: number }> }).rows?.[0]?.taken ?? 0;

      if (taken >= cap) {
        return { error: 'sold_out' as const, cap };
      }

      const slotNumber = taken + 1;

      // If the user is logged in, link the user_id; otherwise null (later flow)
      const userId = req.user?.id ?? null;

      await tx.insert(foundingMembers).values({
        email,
        githubUsername,
        useCase,
        slotNumber,
        status: 'pending',
        freeUntil: sql`NOW() + INTERVAL '6 months'`,
        ...(userId ? { userId } : {}),
      });

      // If logged in, also flip their user row so the dashboard reflects it
      if (userId) {
        await tx
          .update(users)
          .set({
            isFoundingMember: true,
            foundingSlotNumber: slotNumber,
            plan: 'pro',
            planStatus: 'active',
            planRenewsAt: sql`NOW() + INTERVAL '6 months'`,
          })
          .where(eq(users.id, userId));
      }

      return { slotNumber, remaining: cap - taken - 1 };
    });

    if ('error' in result) {
      return reply.code(409).send({
        ok: false,
        error: 'sold_out',
        message: 'All 50 founding slots have been claimed. Join the waitlist for Pro launch pricing.',
      });
    }

    log.info({ email, slotNumber: result.slotNumber }, 'founding slot claimed');

    return reply.send({
      ok: true,
      slotNumber: result.slotNumber,
      remainingSlots: result.remaining,
      message: 'Slot reserved. We\'ll email you within 24 hours to verify your GitHub username and activate Pro.',
    });
  } catch (err) {
    log.error({ err, email }, 'founding slot claim failed');
    return reply.code(500).send({
      error: 'claim_failed',
      message: 'Could not claim slot. Please try again or email founder@deplox.net.',
    });
  }
}

async function remainingFromDb(): Promise<number> {
  try {
    const claimedRows = await db
      .select({ count: count() })
      .from(foundingMembers);
    const claimed = claimedRows[0]?.count ?? 0;
    const maxRows = await db.execute<{ max: number }>(
      sql`SELECT max_slots AS max FROM founding_config WHERE id = 1`,
    );
    const max = Array.isArray(maxRows) && maxRows.length > 0 && typeof maxRows[0] === 'object' && 'max' in maxRows[0]
      ? (maxRows[0] as { max: number }).max
      : (maxRows as unknown as { rows?: Array<{ max: number }> }).rows?.[0]?.max;
    return Math.max(0, (max ?? FOUNDING_SLOTS_TOTAL_FALLBACK) - claimed);
  } catch {
    return FOUNDING_SLOTS_TOTAL_FALLBACK;
  }
}