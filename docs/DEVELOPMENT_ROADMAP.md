# DEVELOPMENT_ROADMAP.md

## Stage 1 — Baby DEPLOX (Weeks 2-3)

**Goal.** Validate that the core build pipeline works end-to-end on the maintainer's laptop.

**Scope.**
- Single-user, local prototype. No auth required for the very first cut.
- `git clone` the repo, run framework detection, build inside Docker, serve on `localhost:8000`.

**Delivered.** Yes, in this codebase. See Stage 2 for the additional layers.

## Stage 2 — Public Beta DEPLOX (Months 3-6)

**Goal.** Multi-tenant, GitHub OAuth, encrypted env vars, custom domains, live logs.

**Delivered.** Yes, in this codebase. The repo as it stands implements Stage 2 entirely.

| Feature | Where |
|---------|-------|
| GitHub OAuth | `apps/api/src/auth/github.ts` |
| Multi-tenant Postgres | `apps/api/src/db/schema.ts` |
| Server-side sessions | `apps/api/src/auth/session.ts` |
| Encrypted env vars | `apps/api/src/services/encryption.ts` |
| Build plane isolation | `apps/api/src/services/docker/real.ts` |
| Custom domain support (Caddy plumbing) | `infra/caddy/Caddyfile` + Stage 3 admin API |
| Live log streaming (SSE) | `apps/api/src/services/log-streamer.ts`, `apps/api/src/routes/deployments.ts` |
| Instant rollback | `apps/api/src/services/deployment-orchestrator.ts#rollbackDeployment` |
| Auto-deploy on webhook | **Deferred to Stage 3** — wiring lives in `apps/api/src/routes/deployments.ts` but is not enabled. |
| PR previews | **Deferred to Stage 3.** |

## Stage 3 — Full DEPLOX Platform (Years 1-2)

**Goal.** Production-grade: team organizations, Firecracker MicroVMs, multi-region, usage billing, SLA guarantees.

### Stage 3.1 — Team organizations (next quarter)

- Add `organizations` and `organization_members` tables.
- Project-level access control: viewer / developer / admin.
- GitHub App installation flow so private repos work for team members.
- Billing per organization.

### Stage 3.2 — Firecracker MicroVMs (2-3 quarters)

- Replace Dockerode with a custom Firecracker controller.
- Per-VM vCPU + memory caps become hardware-enforced.
- Container escape risk drops to ≈0 for shared-kernel vulnerabilities.

### Stage 3.3 — Multi-region routing (2-3 quarters)

- Geo-aware Caddy edges.
- Postgres logical replication per region.
- Cross-region image registry (Harbor or AWS ECR).

### Stage 3.4 — Usage billing (3-4 quarters)

- Per-deployment metered units.
- Stripe integration.
- Per-tier rate limits (per `OPERATIONS.md#tiered-billing-limits`).

### Stage 3.5 — SLA + observability (4-5 quarters)

- Prometheus + Grafana dashboards.
- OpenTelemetry tracing through the orchestrator.
- Public status page.

## Non-goals (recap from DEPLOX_IDEA.md §7)

- AWS-replacement.
- Managed database hosting.
- Source-code storage.
- Free forever.
- Enterprise SLA at day 1.
- Universal framework support (only: React, Next.js, Node, Python, Go, static HTML).