-- 0006_picked_subdomain.sql
-- Let users pick their own <name>.deplox.site subdomain instead of always
-- getting the auto-generated <name>-<short-hash>.deplox.site. See
-- services/subdomain.ts for validation rules and the routes in
-- routes/subdomain.ts for the check/claim/release flow.
--
-- The auto-generated fallback still exists: a project with picked_subdomain
-- IS NULL keeps using <name>-<short-hash>.deplox.site, computed on the fly
-- from the project UUID. This is non-breaking — every existing project
-- starts with picked_subdomain = NULL and continues to work as before.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS picked_subdomain TEXT;

-- Unique on picked_subdomain, but only for non-null values. PostgreSQL
-- treats NULLs as distinct in a unique index by default, so multiple
-- projects with NULL don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS projects_picked_subdomain_uniq
  ON projects (picked_subdomain)
  WHERE picked_subdomain IS NOT NULL;
