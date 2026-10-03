# OPERATIONS.md

Day-2 operations for the DEPLOX maintainer. Stage 1+2 ops are intentionally minimal because the system is single-instance.

## Local development

```bash
pnpm install
cp .env.example .env

# Start Postgres + Redis + Caddy
pnpm compose:up

# Migrate
pnpm db:migrate

# Run API, web, and worker
pnpm dev
```

## Health endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness; always 200. |
| `GET /health/ready` | Readiness; tests DB + Redis. |

`/health/ready` is intended for a load balancer / k8s readiness probe.

## Logs

Structured JSON in production (`DEPLOX_LOG_PRETTY=0`). Pretty colors in dev.

Secrets are redacted in two layers:
1. Pino redaction for known key paths (`*.token`, `*.secret`, etc.).
2. `redactString` for free-form lines that may have already concatenated a secret.

If you ever see a raw secret in a log, that's a bug — file an issue with the line and we'll add the pattern.

## Incident response

| Symptom | First action |
|---------|--------------|
| API 500s spike | `GET /health/ready` — is DB / Redis up? |
| All builds fail with `Could not detect framework` | Did we ship a regression in `framework-detector.ts`? Roll back. |
| Port range full | `ssh` and run `pnpm --filter @deplox/api run cleanup:orphans` (TODO Stage 3.1). |
| SSE connections drop | Likely nginx / Caddy buffering — ensure `X-Accel-Buffering: no` is set (it is, in `routes/deployments.ts`). |

## Backups

| Asset | Backup method | Frequency |
|-------|---------------|-----------|
| Postgres | `pg_dump deplox > backup.sql` | Daily (Stage 3: WAL streaming) |
| Docker image registry | n/a in Stage 1+2 | n/a |
| User source code | n/a — GitHub is source of truth | n/a |
| `.env` files | **Never committed.** Manual off-host backup. | As you change them |

## Rotating DEPLOX_ENCRYPTION_KEY

```sql
-- Decrypt with old key (DEPLOX_ENCRYPTION_KEY=<old>)
-- Re-encrypt with new key (DEPLOX_ENCRYPTION_KEY=<new>)

UPDATE env_vars
SET encrypted_value = encrypt_with_new_key(decrypt_with_old_key(encrypted_value));
```

For Stage 1+2 (single tenant) a quick maintenance window script suffices:

```bash
# 1. Stop the API.
# 2. Update DEPLOX_ENCRYPTION_KEY in .env.
# 3. Re-run encryption over a SELECT/UPDATE loop.
# 4. Start the API.
```

Stage 3 will implement this as a rolling key rotation with two-key overlap.

## Rotating DEPLOX_GITHUB_CLIENT_SECRET

1. Generate a new secret at https://github.com/settings/developers.
2. Update `.env`.
3. Restart the API. Existing sessions remain valid; new logins use the new secret.

## Tiered billing limits (Stage 3 preview)

| Tier | Projects | Build min/mo | Bandwidth | Log retention |
|------|----------|--------------|-----------|---------------|
| Free | 2 | 100 | 10 GB | 30 d |
| Pro | 10 | 1,000 | 100 GB | 90 d |
| Team | 50 | 5,000 | 1 TB | 365 d |

Stage 3 will add per-tier enforcement to `routes/projects.ts` and `routes/deployments.ts`. Currently we enforce none — this is documented as a known gap in [THREAT_MODEL.md#t6-resource-exhaustion](THREAT_MODEL.md#t6--resource-exhaustion).

## Monitoring checklist (Stage 3.5)

- [ ] Prometheus exporter for Fastify (`fastify-metrics`).
- [ ] OpenTelemetry traces through `runDeployment()`.
- [ ] Grafana dashboard with panels for: API latency, build duration p50/p95, deploy success rate, port utilization, active deployments.
- [ ] Alertmanager rules: API error rate > 5% / 5min; build queue depth > 50.

## Off-boarding a user

When a user requests deletion:

```sql
-- Cascade deletes projects → deployments + env_vars + sessions.
DELETE FROM users WHERE github_id = $1;
```

For Stage 3 add a 7-day soft-delete window with a reactivation endpoint.