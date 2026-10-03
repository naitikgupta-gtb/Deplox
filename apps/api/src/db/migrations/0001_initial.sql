-- 0001_initial.sql
-- DEPLOX Stage 1 + 2 schema.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id       BIGINT NOT NULL UNIQUE,
  username        TEXT NOT NULL,
  display_name    TEXT,
  avatar_url      TEXT,
  email           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_uniq ON users (username);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS projects (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                            TEXT NOT NULL,
  github_repo_full_name           TEXT NOT NULL,
  github_repo_url                 TEXT NOT NULL,
  github_access_token_encrypted   TEXT,
  default_branch                  TEXT NOT NULL DEFAULT 'main',
  framework                       TEXT,
  custom_domain                   TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_custom_domain_uniq ON projects (custom_domain);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id);

CREATE TABLE IF NOT EXISTS deployments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  commit_sha      TEXT NOT NULL,
  commit_message  TEXT,
  commit_author   TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',
  framework       TEXT,
  container_id    TEXT,
  host_port       INTEGER,
  image_tag       TEXT,
  public_url      TEXT,
  error_message   TEXT,
  build_logs      TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS deployments_project_idx ON deployments (project_id);
CREATE INDEX IF NOT EXISTS deployments_status_idx ON deployments (status);

CREATE TABLE IF NOT EXISTS env_vars (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key               TEXT NOT NULL,
  encrypted_value   TEXT NOT NULL,
  is_secret         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS env_vars_project_key_uniq ON env_vars (project_id, key);