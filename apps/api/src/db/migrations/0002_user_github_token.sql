-- 0002_user_github_token.sql
-- Add column to persist each user's GitHub OAuth token (encrypted) so we can
-- make authenticated GitHub API calls on their behalf. Avoids the
-- 60-req/hour anonymous rate limit.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS github_access_token_encrypted TEXT;