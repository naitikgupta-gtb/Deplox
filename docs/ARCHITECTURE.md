# ARCHITECTURE.md

## Core system model

DEPLOX is structured as **three explicit planes** with strict ownership boundaries.

```
                          ┌─────────────────────────────────────┐
                          │  Public Internet (HTTPS)            │
                          └──────────────┬──────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       PLANE 1 — Control Plane                        │
│  • Fastify REST API + OAuth callback                                 │
│  • BullMQ producers                                                  │
│  • Postgres (Drizzle ORM) + Redis                                    │
│  • User code NEVER executes here                                     │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ (enqueue build/run)
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  PLANE 2 — Build Plane (Ephemeral)                   │
│  • Dockerode buildImage() inside temporary container                 │
│  • Strictly network-limited (only package registries allowed)        │
│  • CPU / RAM capped via DEPLOX_BUILD_* env vars                       │
│  • NO docker.sock exposed to user containers                         │
│  • NO runtime secrets injected here                                  │
│  • Container is destroyed after build completes                      │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ (produces image tag)
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  PLANE 3 — Runtime Plane (Execution)                 │
│  • Built image run via Dockerode createContainer + start             │
│  • Env vars decrypted only here (AES-256-GCM)                        │
│  • User runs as `nobody` (non-root)                                  │
│  • Memory + CPU capped via DEPLOX_RUNTIME_*                          │
│  • Host port mapped to container port, exposed via Caddy             │
│  • Per-deployment network isolation                                  │
└──────────────────────────────────────────────────────────────────────┘
```

## Why three planes

A naive deployment tool mixes the API server, the build pipeline, and the user application into one process. That model leaks credentials, lets a malicious build escape into the host, and makes horizontal scaling painful.

By splitting along the trust boundary — "code the user wrote" vs "code DEPLOX wrote" — we get:

- **Easier isolation.** Each plane has its own network namespace, resource limits, and security posture.
- **Independent scaling.** The control plane is tiny and stateless; the build plane is heavy and bursty; the runtime plane is long-lived.
- **Forensic clarity.** When something goes wrong we know which plane to look at first.

## Async messaging

```
   api  ──▶ BullMQ (Redis) ──▶ worker (apps/worker)
                                    │
                                    └──▶ same orchestrator functions
```

In Stage 1+2 the API also runs the orchestrator inline for low latency. Stage 3 will move the runtime plane to a dedicated worker pool.

## Code map

| Component | File |
|-----------|------|
| API bootstrap | `apps/api/src/server.ts` |
| Auth (GitHub OAuth + sessions) | `apps/api/src/auth/` |
| Routes | `apps/api/src/routes/` |
| Build orchestration | `apps/api/src/services/deployment-orchestrator.ts` |
| Framework detection | `apps/api/src/services/framework-detector.ts` |
| Docker provider (real + mock) | `apps/api/src/services/docker/` |
| Encryption (env vars at rest) | `apps/api/src/services/encryption.ts` |
| Log streamer | `apps/api/src/services/log-streamer.ts` |
| BullMQ queues | `apps/api/src/queues/index.ts` |
| Worker entrypoint | `apps/api/src/worker-entry.ts` |