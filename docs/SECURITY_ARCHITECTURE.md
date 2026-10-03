# SECURITY_ARCHITECTURE.md

## Non-negotiable rules

These are absolute. Any PR that violates one of these is rejected without review.

1. **User code never runs on the DEPLOX host.** Always inside a container.
2. **`docker.sock` is never exposed to user containers.**
3. **Build and runtime secrets are isolated.** Build logs auto-redact; runtime secrets are only injected at `docker run` time.
4. **All database queries are scoped by `req.user.id`.** Never trust path params for ownership.
5. **Aggressive rate limiting on auth, deployment, and webhook endpoints.**

## Plane-by-plane controls

### Plane 1 — Control Plane

| Control | Implementation |
|---------|----------------|
| Auth | GitHub OAuth (server-side session cookies, httpOnly + sameSite=lax). |
| Session storage | Postgres `sessions` table. Revocable instantly. |
| Authorization | `requireAuth` middleware; every handler calls `loadOwnedProject(...)` / `loadOwnedDeployment(...)`. |
| Input validation | Zod schemas at every route boundary (`CreateProjectSchema`, `PutEnvSchema`, etc.). |
| Error disclosure | `setErrorHandler` strips stack traces for 5xx responses. |
| Secrets at rest | AES-256-GCM with key from `DEPLOX_ENCRYPTION_KEY`. |
| CORS | Allows `http://localhost:*` in dev; pinned to `DEPLOX_PUBLIC_URL` in prod. |

### Plane 2 — Build Plane

| Control | Implementation |
|---------|----------------|
| Isolation | Separate container, destroyed after build. |
| Network | `--network=deplox-build` (no DNS except package registries). |
| Resource caps | CPU via `NanoCpus`, Memory via `Memory`. |
| No host mount | Source dir is bind-mounted RW during build; container has no access to host. |
| Log redaction | Pino paths redact common secret keys; `redactString` handles JWT/GitHub PAT/Bearer headers in free-form lines. |
| No docker.sock | The build container never receives `--privileged` and the docker daemon socket is bind-mounted only into the API process, never into user containers. |

### Plane 3 — Runtime Plane

| Control | Implementation |
|---------|----------------|
| Non-root user | `User: 'nobody'`. |
| Resource caps | CPU + Memory per `DEPLOX_RUNTIME_*`. |
| Auto-remove | `AutoRemove: true` so stopped containers leave no trace. |
| Network | `deplox-runtime` private network; only the assigned host port is mapped. |
| Read-only rootfs | Off by default (some frameworks need to write to `/tmp`); revisit in Stage 3. |
| Secrets injection | Env vars decrypted in `deployment-orchestrator.ts` immediately before `provider.run()` and never logged. |

## Cookie + cookie attributes

```
httpOnly: true
sameSite: lax
secure:   true (production)
maxAge:   30 days
```

Session ID is 32 random bytes (hex). Revocation = `DELETE FROM sessions WHERE id = $1`.

## Rate limiting (Stage 2)

Implemented in `routes/auth.ts` via Fastify's `onRequest` hook + an in-memory token bucket. For multi-instance deployments move to Redis-backed (`rate-limiter-flexible`).

| Endpoint | Limit |
|----------|-------|
| `GET /auth/github` | 10 / min / IP |
| `GET /auth/github/callback` | 10 / min / IP |
| `POST /api/projects/:id/deployments` | 10 / min / user |
| `GET /api/deployments/:id/logs` | 30 / min / user |

## Reporting

Security contact: `security@deplox.dev` (per [DEPLOX_IDEA.md §10](DEPLOX_IDEA.md#10-launch-criteria--checklist)). Until the domain is provisioned, route through GitHub Security Advisories on this repo.