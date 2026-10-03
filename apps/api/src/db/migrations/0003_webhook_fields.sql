-- 0003_webhook_fields.sql
-- Add webhookSecret and autoDeploy to projects so each project can opt-in
-- to automatic deploys on push (driven by GitHub webhooks).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS auto_deploy BOOLEAN NOT NULL DEFAULT FALSE;