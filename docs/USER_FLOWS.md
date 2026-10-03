# USER_FLOWS.md

## Flow 1 — First-time sign-up

```
┌─────────────┐  GET /            ┌────────────────┐
│ Browser     │ ────────────────▶ │ Vite dev       │  → renders LandingPage
└─────────────┘                   └────────────────┘
       │
       │ click "Log in with GitHub"
       ▼
┌─────────────┐  GET /auth/github  ┌────────────────┐
│ Browser     │ ────────────────▶ │ Fastify API    │
└─────────────┘                    └────────────────┘
       │
       │ 302 → https://github.com/login/oauth/authorize?client_id=…&state=…&scope=read:user+repo
       ▼
       │
       │ (user approves on github.com)
       ▼
┌─────────────┐  GET /auth/github/callback?code=…&state=…   ┌────────────────┐
│ Browser     │ ────────────────────────────────────────▶ │ Fastify API    │
└─────────────┘                                            └────────────────┘
       │
       │ 302 → /dashboard ; Set-Cookie: deplox.sid=…
       ▼
┌─────────────┐  GET /dashboard   ┌────────────────┐
│ Browser     │ ───────────────▶ │ React renders  │
└─────────────┘                  │ DashboardPage  │
                                 └────────────────┘
```

**Where it lives:** `apps/api/src/auth/github.ts`, `apps/web/src/pages/LandingPage.tsx`.

## Flow 2 — Deploy a repo

```
DashboardPage → NewProjectPage
   │                                       submit form
   ▼                                          │
   POST /api/projects {githubRepoFullName}    ▼
   │                                       Fastify
   │   ┌────────────────────────────────────────────┐
   │   │ • validate Zod                              │
   │   │ • GitHub repos.get → metadata                │
   │   │ • INSERT projects                           │
   │   └────────────────────────────────────────────┘
   ▼
   201 → { project }

… navigate to ProjectPage …

   POST /api/projects/:id/deployments
   │   ┌────────────────────────────────────────────┐
   │   │ • INSERT deployments (status=queued)        │
   │   │ • runDeployment() in background             │
   │   └────────────────────────────────────────────┘
   ▼
   202 → { deployment }

   deployment lifecycle (logged via SSE):
     queued → cloning → detecting → building → starting → running

… user opens DeploymentPage …

   GET /api/deployments/:id/logs
   │   ┌────────────────────────────────────────────┐
   │   │ • text/event-stream                         │
   │   │ • replay buffered lines                     │
   │   │ • subscribe to live updates                 │
   │   └────────────────────────────────────────────┘
   ▼
   log lines stream into <pre class="log-viewer">
```

**Where it lives:** `apps/api/src/services/deployment-orchestrator.ts`, `apps/web/src/pages/DeploymentPage.tsx`.

## Flow 3 — Rollback a bad deploy

```
DeploymentPage → click "Rollback" → confirm target deployment
   │
   POST /api/deployments/:id/rollback {targetDeploymentId}
   │   ┌────────────────────────────────────────────┐
   │   │ • verify ownership                          │
   │   │ • stop all running deployments for project  │
   │   │ • INSERT deployments (status=queued)        │
   │   │ • allocate port                             │
   │   │ • provider.run() with previous imageTag     │
   │   └────────────────────────────────────────────┘
   ▼
   202 → { newDeploymentId }
   navigate → /projects/:id/deployments/:newDeploymentId
```

**Where it lives:** `apps/api/src/services/deployment-orchestrator.ts#rollbackDeployment`.

## Flow 4 — Set env vars

```
ProjectPage → EnvEditor
   │   click "Add variable"
   ▼
   input rows: KEY, VALUE, isSecret?
   click "Save"
   │
   ▼
   PUT /api/projects/:id/env {variables: [...]}
   │   ┌────────────────────────────────────────────┐
   │   │ • validate UPPER_SNAKE_CASE key             │
   │   │ • AES-256-GCM encrypt each value            │
   │   │ • upsert into env_vars                      │
   │   └────────────────────────────────────────────┘
   ▼
   { ok: true }

   next deployment: orchestrator decrypts and injects into `docker run -e`
```

**Where it lives:** `apps/api/src/routes/env.ts`, `apps/api/src/services/encryption.ts`.

## Flow 5 — Stop a deploy

```
DeploymentPage → click "Stop"
   │
   POST /api/deployments/:id/stop
   │   ┌────────────────────────────────────────────┐
   │   │ • loadOwnedDeployment                       │
   │   │ • stopDeployment():                         │
   │   │   - provider.stop(containerId)              │
   │   │   - releasePort()                           │
   │   │   - status='stopped'                        │
   │   └────────────────────────────────────────────┘
   ▼
   { ok: true }
```

**Where it lives:** `apps/api/src/services/deployment-orchestrator.ts#stopDeployment`.

## Error UX

- API errors are returned as `{ error, message }`.
- The web client surfaces `message` in red below the relevant form / button.
- For 401 (session expired), the dashboard redirects to `/` (landing) — no jarring modal.

**Where it lives:** `apps/web/src/lib/api.ts#ApiError`, `apps/web/src/App.tsx`.