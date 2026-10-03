# PROJECT_STRUCTURE.md

## Monorepo layout

```
deplox/
├── apps/
│   ├── api/        # Fastify REST API
│   ├── web/        # React + Vite dashboard
│   └── worker/     # BullMQ worker (currently thin; runs api/src/worker-entry.ts)
├── packages/
│   ├── shared-types/    # TypeScript types shared by api, web, worker
│   ├── shared-config/   # Zod-validated env config
│   └── shared-logger/   # Pino with secret redaction
├── infra/
│   ├── docker-compose.yml      # local Postgres + Redis + Caddy
│   ├── caddy/Caddyfile         # reverse proxy + on-demand TLS
│   └── docker/build.Dockerfile # multi-framework build-runner base image
└── docs/                       # the 11 specification documents
```

## Why a monorepo

A single repo with workspace packages means:

- **Type safety end-to-end.** `Deployment` defined once in `shared-types` is the same shape in the React UI, the Fastify handler, and the worker.
- **Atomic refactors.** Renaming a field is a single PR.
- **Single `pnpm install`.** No "did you forget to update the worker package?" footgun.

We considered splitting web into its own Vercel deploy and keeping api/worker in a separate repo. The downside — duplicated types and out-of-sync contracts — outweighed the upside.

## Why pnpm

- Hard links save disk when 3 packages all need `fastify`.
- Strict peer-dep resolution prevents silent breakage.
- Workspace protocol (`workspace:*`) makes intra-monorepo deps obvious.

We pin `packageManager` in the root `package.json` so Corepack picks the right version.

## Boundary rules

| Rule | Why |
|------|-----|
| `apps/api` is the only package allowed to talk to Postgres directly. | Keeps the schema and queries colocated; the worker imports API code. |
| `packages/shared-types` is the only package with no runtime dependencies. | Forces it to remain a pure type module. |
| `packages/shared-logger` is allowed to depend on `shared-config` only. | No `logger → api` reverse dep. |
| `apps/web` may not import from `apps/api`. | Forces a clean API boundary. |
| `apps/worker` may not import from `apps/web`. | It runs in a headless Node process. |

## Adding a new package

1. `mkdir packages/<name>`
2. Add to `pnpm-workspace.yaml` (already covers `packages/*`).
3. Copy a sibling `tsconfig.json` and adjust `composite: true` if it should be referenced.
4. Update `apps/api/tsconfig.json` `references` array if other packages depend on it.
5. Add to `apps/<dependent>/package.json` `dependencies` as `"@deplox/<name>": "workspace:*"`.