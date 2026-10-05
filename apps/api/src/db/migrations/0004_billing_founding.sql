-- 0004_billing_founding.sql
-- Phase 4d: Billing subscriptions + founding-member program.
--
-- This migration is intentionally additive — no destructive changes.
-- All money/plan logic stays at the application layer; this just gives us
-- durable storage for subscription state and the "first 50" founding program.

-- ---------------------------------------------------------------------------
-- users: add billing columns
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'team')),
  ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'none'
    CHECK (plan_status IN ('none', 'active', 'past_due', 'cancelled')),
  ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS founding_slot_number INTEGER;

-- ---------------------------------------------------------------------------
-- subscriptions: durable record of every Razorpay subscription lifecycle event.
-- Used to audit billing changes and reconcile against Razorpay's dashboard.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_subscription_id TEXT NOT NULL UNIQUE,
  razorpay_plan_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('pro', 'team')),
  status TEXT NOT NULL CHECK (status IN ('created', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  amount_paise INTEGER NOT NULL, -- ₹19900 = ₹199
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);

-- ---------------------------------------------------------------------------
-- invoices: GST-compliant invoice records (one per paid period).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  razorpay_invoice_id TEXT UNIQUE,
  amount_paise INTEGER NOT NULL,
  gst_paise INTEGER NOT NULL,
  total_paise INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'pending', 'failed', 'refunded')),
  invoice_url TEXT,
  invoice_number TEXT, -- "INR-2026-001"
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invoices_user_idx ON invoices(user_id);

-- ---------------------------------------------------------------------------
-- founding_members: the "first 50" program.
-- A row is created when someone claims a slot. The slot number is allocated
-- server-side atomically using a SELECT ... FOR UPDATE pattern in code.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS founding_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  github_username TEXT NOT NULL,
  use_case TEXT NOT NULL,
  slot_number INTEGER NOT NULL UNIQUE CHECK (slot_number >= 1 AND slot_number <= 50),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'activated', 'expired')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  free_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '6 months')
);
CREATE INDEX IF NOT EXISTS founding_members_email_idx ON founding_members(email);
CREATE INDEX IF NOT EXISTS founding_members_user_idx ON founding_members(user_id);
CREATE INDEX IF NOT EXISTS founding_members_status_idx ON founding_members(status);

-- ---------------------------------------------------------------------------
-- founding_config: singleton row with program metadata (max slots, etc.)
-- Allows adjusting the cap without a code deploy.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS founding_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  max_slots INTEGER NOT NULL DEFAULT 50,
  free_duration_months INTEGER NOT NULL DEFAULT 6,
  program_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  program_ends_at TIMESTAMPTZ,
  CONSTRAINT founding_config_singleton CHECK (id = 1)
);
INSERT INTO founding_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- billing_events: append-only audit log of every webhook + state change.
-- Useful for debugging "why did this user's plan flip to past_due" questions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('razorpay_webhook', 'admin', 'manual', 'founding')),
  event_type TEXT NOT NULL, -- 'subscription.activated', 'invoice.paid', etc.
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_events_user_idx ON billing_events(user_id);
CREATE INDEX IF NOT EXISTS billing_events_type_idx ON billing_events(event_type);