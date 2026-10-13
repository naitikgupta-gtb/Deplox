-- 0005_custom_domain_verification.sql
-- Add DNS-TXT verification flow to custom domains. Before this migration a
-- user could set any customDomain in their project settings and the API
-- would immediately register a Caddy route for it. That's fine in
-- practice (the user has to point their own DNS to us for it to actually
-- serve traffic), but it gave no UX hint that they hadn't actually set
-- anything up yet.
--
-- New flow:
--   1. User sets customDomain = "example.com" in project settings
--   2. API generates a 32-char random token, stores it in
--      custom_domain_verification_token, and marks the project
--      custom_domain_verified = false. NO Caddy route is registered.
--   3. UI shows the user the TXT record to add:
--         _deplox-verify.example.com  TXT  "deplox-verify=<token>"
--   4. User clicks "Verify". API does a DNS TXT lookup at
--      _deplox-verify.<customDomain>. If the value matches the token,
--      custom_domain_verified = true and the Caddy route is registered
--      (against the project's currently-running deployment, if any, or
--      queued for the next deploy).
--   5. If the user removes customDomain, all four columns reset to NULL
--      and the Caddy route is unregistered.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS custom_domain_verified             BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_domain_verification_token  TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain_verified_at         TIMESTAMPTZ;

-- Backfill: any project that already had a customDomain before this
-- migration was registered with the old "trust the user" flow. Mark
-- them verified so the new UI doesn't suddenly claim they're unverified
-- for domains they've had working for months.
UPDATE projects
   SET custom_domain_verified     = true,
       custom_domain_verified_at  = COALESCE(updated_at, NOW())
 WHERE custom_domain IS NOT NULL
   AND custom_domain_verified = false;
