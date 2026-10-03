# THREAT_MODEL.md

We enumerate threats against DEPLOX and what we currently do about each. "Where it lives" points at the file that implements the mitigation so future maintainers can audit coverage.

## Assets

1. User source code (transient in `/tmp/deplox-clone-*` during build).
2. User GitHub access tokens (encrypted at rest).
3. User env vars (encrypted at rest).
4. The DEPLOX host itself.
5. Other DEPLOX users' containers.
6. The DEPLOX public URL reputation.

## Threats

### T1 — Malicious user code escapes container

**Description.** A build or runtime script exploits a kernel bug to read host files or pivot.

**Mitigation.**
- Docker (not yet Firecracker / microVMs — see `DEVELOPMENT_ROADMAP.md`).
- No `--privileged`, no host namespace sharing.
- CPU / RAM caps so OOM-based escapes are harder.
- `docker.sock` is never bind-mounted into a user container.

**Status:** acceptable for Stage 1+2. **Stage 3** will migrate to Firecracker MicroVMs for shared-kernel independence.

**Where it lives:** `apps/api/src/services/docker/real.ts`.

### T2 — Build reads env vars meant for runtime

**Description.** A `build` step can `echo $DATABASE_URL` and exfiltrate runtime-only secrets.

**Mitigation.**
- Runtime env vars are decrypted and injected **after** the build completes (`deployment-orchestrator.ts`).
- Build logs are redacted by the logger (`packages/shared-logger/src/index.ts`).
- We never pass `-e` to `docker build`.

**Where it lives:** `apps/api/src/services/deployment-orchestrator.ts`, `packages/shared-logger/src/index.ts`.

### T3 — User A reads user B's running container

**Description.** A container escape or accidentally-shared network namespace leaks data.

**Mitigation.**
- Each container runs on the dedicated `deplox-runtime` network with no peer discovery.
- Port mapping is host-port → container-port; container IPs are not exposed to the dashboard.
- Containers run as `nobody` and cannot read other containers' filesystems.

**Where it lives:** `apps/api/src/services/docker/real.ts` (`NetworkMode`).

### T4 — Stolen session cookie

**Description.** An attacker captures the session cookie from a user's machine.

**Mitigation.**
- `httpOnly` blocks JS access.
- `sameSite=lax` blocks cross-origin POST CSRF.
- `secure` in production blocks plain-HTTP transmission.
- Sessions are revocable server-side via `DELETE FROM sessions`.

**Out of scope (Stage 3):** device fingerprinting, 2FA.

**Where it lives:** `apps/api/src/auth/session.ts`.

### T5 — Path-parameter ownership confusion

**Description.** `GET /api/projects/:id` is hit with another user's project ID.

**Mitigation.**
- Every handler calls `loadOwnedProject(projectId, req.user.id)` which combines `projects.id = $1 AND projects.user_id = $2` in a single SQL statement.
- No handler reads from `req.params` alone for ownership decisions.

**Where it lives:** `apps/api/src/routes/projects.ts`, `apps/api/src/routes/deployments.ts`.

### T6 — Resource exhaustion

**Description.** A user repeatedly builds large projects, filling disk / memory / port range.

**Mitigation.**
- Per-container CPU and memory caps.
- Build timeout (`DEPLOX_BUILD_TIMEOUT_SECONDS`).
- Port range with bounded size (`DEPLOX_DEPLOY_PORT_RANGE_START..END`).
- Per-user project quota (enforced in `routes/projects.ts` POST — currently unlimited in dev, will add to Stage 3).
- Rate limiting on `/api/projects/:id/deployments` (10/min).

**Where it lives:** `apps/api/src/services/port-allocator.ts`, `apps/api/src/routes/deployments.ts`.

### T7 — Dependency supply-chain attack

**Description.** A compromised npm / pypi / go module injects code into the build step.

**Mitigation.**
- Lockfiles committed.
- `npm ci` (not `npm install`) in generated Dockerfiles for Node projects.
- `go mod download` only — build offline after that.
- For Stage 3: vendor a private registry mirror.

**Where it lives:** `apps/api/src/services/docker/real.ts` (per-framework templates).

### T8 — DDoS on control plane

**Mitigation.**
- Rate limiting (see SECURITY_ARCHITECTURE.md).
- Behind a reverse proxy with IP-level rate limiting (Cloudflare / nginx).
- BullMQ queues make the API stateless — scale horizontally.

**Where it lives:** `apps/api/src/server.ts` (CORS + proxy config).

### T9 — Secrets leaked in logs

**Mitigation.**
- Pino redaction for known key paths (`packages/shared-logger/src/index.ts`).
- `redactString` for free-form log lines.
- Build logs are persisted to DB only after the build completes; we never store raw log lines that bypassed redaction.

**Where it lives:** `packages/shared-logger/src/index.ts`.

### T10 — OAuth redirect manipulation

**Description.** Attacker tricks a user into completing OAuth with the attacker's `client_id`.

**Mitigation.**
- `state` is generated server-side and validated; mismatch → reject.
- `redirect_uri` is hard-pinned to `DEPLOX_GITHUB_CALLBACK_URL` and validated by GitHub.

**Where it lives:** `apps/api/src/auth/github.ts`.

## Residual risk register

| Risk | Acceptable? | Follow-up |
|------|-------------|-----------|
| Shared-kernel isolation (Docker) | Yes (Stage 1+2). | Migrate to Firecracker in Stage 3. |
| Per-user resource quotas | Yes in dev. | Add DB-backed quotas in Stage 3. |
| Long-lived GitHub PATs | Yes. | Add refresh-token handling + expiry in Stage 3. |