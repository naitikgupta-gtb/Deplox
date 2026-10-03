# DEPLOX

**Apna GitHub code daalo, 2 minute me live website. Apne rules ke saath.**

DEPLOX is an honest, opinionated deployment platform for developers. You log in with GitHub, pick a repo, click Deploy — and your app is live with HTTPS on a deterministic URL. No server juggling, no Docker gymnastics, no `nginx.conf` archaeology.

This monorepo implements **Stage 1 (Baby DEPLOX)** and **Stage 2 (Public Beta)** of the [DEPLOX Idea Document](docs/DEPLOX_IDEA.md). Stage 3 (full platform with Firecracker MicroVMs, team orgs, and usage billing) is scoped in [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md).

---

## What this repo contains

```
deplox/
├── apps/
│   ├── api/        # Fastify REST API (auth, projects, deployments, SSE logs)
│   ├── web/        # React + Vite dashboard
│   └── worker/     # BullMQ build & runtime worker (clone, build, run, stop)
├── packages/
│   ├── shared-types/   # End-to-end TypeScript interfaces
│   ├── shared-config/  # Zod-validated environment schemas
│   └── shared-logger/  # Pino logger with secret redaction
├── infra/
│   ├── docker-compose.yml    # Postgres + Redis + Caddy for local dev
│   ├── caddy/Caddyfile       # Reverse proxy + on-demand TLS for custom domains
│   └── docker/
│       └── build.Dockerfile  # Multi-framework build container (Node/Python/Go/Static)
└── docs/                    # 11 architecture spec documents
```

---

## Quick start (development, no Docker required)

```bash
# 1. Install dependencies (pnpm 9+)
pnpm install

# 2. Copy env
cp .env.example .env

# 3. Start Postgres + Redis via docker-compose
#    (if you don't have Docker, skip this — see "Mock-only mode" below)
pnpm compose:up

# 4. Run database migrations
pnpm db:migrate

# 5. Start API, worker, and web dashboard in parallel
pnpm dev
```

The web dashboard will be at `http://localhost:5173`, the API at `http://localhost:8080`, and (when not in mock mode) the Caddy reverse proxy at `http://localhost:8000`.

### Mock-only mode (no Docker at all)

Set `DEPLOX_MOCK_DOCKER=1` in `.env` (it's the default in `.env.example`). The API uses an in-memory provider that simulates Docker pulls/builds/runs so you can develop and test the entire orchestration layer without Docker installed. Stage 2 features that *do* need real Postgres/Redis (auth, projects, deployments persistence, env-var encryption, log streaming) work normally.

When you're ready to actually deploy, set `DEPLOX_MOCK_DOCKER=0`, install Docker Desktop, and `pnpm compose:up` will spin up the full stack.

---

## Tech stack (per DEPLOX spec §14)

| Layer | Technology |
|------|------------|
| Frontend | React + Vite + TypeScript |
| Backend API | Node.js + Fastify + TypeScript |
| Worker | BullMQ (Redis) + TypeScript |
| Database | PostgreSQL (via Drizzle ORM) |
| Queue / Cache | Redis |
| Runtime isolation | Docker (mocked in dev) |
| Reverse proxy | Caddy (automatic HTTPS) |
| Auth | GitHub OAuth |

---

## Specification documents

The 11 spec documents referenced in [DEPLOX_IDEA.md §16](docs/DEPLOX_IDEA.md#16-specification-documents-index) live under [`docs/`](docs/):

| File | Covers |
|------|--------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Core 3-plane system model |
| [SECURITY_ARCHITECTURE.md](docs/SECURITY_ARCHITECTURE.md) | Isolation rules per plane |
| [THREAT_MODEL.md](docs/THREAT_MODEL.md) | Threats and mitigations |
| [PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | Monorepo layout rationale |
| [ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) | Env var schemas and secrets |
| [DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) | Stage 1 → 2 → 3 plan |
| [DESIGN_RULES.md](docs/DESIGN_RULES.md) | UI & copy anti-patterns |
| [BUILD_SYSTEM.md](docs/BUILD_SYSTEM.md) | Container build pipeline |
| [USER_FLOWS.md](docs/USER_FLOWS.md) | Auth and deploy UX |
| [OPERATIONS.md](docs/OPERATIONS.md) | Incidents, billing, ops |
| [DEPLOX_IDEA.md](docs/DEPLOX_IDEA.md) | Complete vision spec (v1.0.0) |

---

## Philosophy

DEPLOX is not magic. It is an honest, narrow deployment runner:

- ✅ We support top mainstream web frameworks (React, Next.js, Node, Python, Go, static HTML).
- ❌ We are not an AWS replacement, not a managed DB host, not free forever, not source storage, not enterprise SLA day-1.

See [DEPLOX_IDEA.md §7](docs/DEPLOX_IDEA.md#7-deplox-kya-nahi-hai-honest-boundaries) for the full "What DEPLOX is NOT" list.

---

## Status

| Stage | Status | Notes |
|-------|--------|-------|
| Stage 1 — Baby DEPLOX | ✅ Implemented | Local build prototype + GitHub OAuth + multi-project multi-tenant |
| Stage 2 — Public Beta | ✅ Implemented | Custom domains (Caddy), encrypted env, live logs, instant rollback |
| Stage 3 — Full Platform | ⏳ Planned | Firecracker MicroVMs, multi-region, usage billing — see roadmap |

---

## Maintainer note

This is a 1–2 year commitment. Stability beats speed. Every line of code is meant to be read, understood, and driven by a human. AI tools accelerate; humans decide.