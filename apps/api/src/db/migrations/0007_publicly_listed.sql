-- 0007_publicly_listed.sql
-- Privacy fix: the deplox landing page used to hardcode 4 "customer" apps
-- (the deplox owner's own projects) and show them to every visitor. Any
-- logged-in user also saw them in a "Powering" sidebar that implied they
-- owned those projects -- a clear cross-user data leak.
--
-- This migration adds a `publicly_listed` boolean (default false). The
-- landing page's "Live on deplox" strip now only shows projects that the
-- owner has explicitly opted into. The dashboard sidebar's "Powering"
-- block has been removed entirely from the JSX (no per-user equivalent
-- for now; the main Projects section already lists the user's own work).
--
-- IMPORTANT: no backfill. All existing rows default to publicly_listed =
-- false, so the landing page will show zero projects after this
-- migration. The deplox owner can opt-in individual projects via
-- PATCH /api/projects/:id { publiclyListed: true } from the project
-- settings.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS publicly_listed BOOLEAN NOT NULL DEFAULT false;
