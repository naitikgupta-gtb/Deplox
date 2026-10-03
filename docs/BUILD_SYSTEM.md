# BUILD_SYSTEM.md

## Pipeline

```
1. clone       git clone --depth=50 --single-branch <url> /tmp/deplox-clone-XXX
2. detect      read package.json / go.mod / pyproject.toml / index.html
3. generate    write Dockerfile.deplox into the source dir (per-framework template)
4. build       docker build -t deplox/<deploymentId>:<ts> .
5. run         docker run --rm --network=deplox-runtime --user=nobody \
                 -p <hostPort>:<containerPort> \
                 -e <decrypted env vars> \
                 deplox/<deploymentId>:<ts>
```

## Per-framework behaviour

| Framework | Container port | Build command | Runtime command |
|-----------|----------------|---------------|-----------------|
| React     | `80`           | `npm ci && npm run build` | `nginx -g 'daemon off;'` (serving `dist/`) |
| Next.js   | `3000`         | `npm ci && npm run build` | `node server.js` (standalone) |
| Node      | `3000`         | `npm ci --omit=dev`        | `node index.js` |
| Python    | `8000`         | `pip install -r requirements.txt` | `python -m uvicorn main:app` |
| Go        | `8080`         | `go mod download && go build` | `app` |
| Static    | `80`           | (none)                     | `nginx -g 'daemon off;'` |

Generated at deploy time in `apps/api/src/services/docker/real.ts`.

## Why these defaults

- **`npm ci`** (not `npm install`) — respects the committed `package-lock.json`.
- **`--omit=dev`** for plain Node — dev dependencies are a build-time concern, not a runtime one.
- **Standalone Next.js** — minimizes the runtime image; no `node_modules` shipped.
- **`go build` with `CGO_ENABLED=0`** — produces a static binary; runtime is just alpine.
- **`python -m uvicorn`** — the current default for FastAPI / Starlette apps.
- **nginx for static + React** — battle-tested, predictable defaults.

## Resource caps

Configured via env vars (see `ENVIRONMENT_VARIABLES.md`):

```
DEPLOX_BUILD_CPU=2
DEPLOX_BUILD_MEMORY=2g
DEPLOX_RUNTIME_CPU=1
DEPLOX_RUNTIME_MEMORY=512m
DEPLOX_BUILD_TIMEOUT_SECONDS=900
```

Mapped to Dockerode's `Memory` (bytes) and `NanoCpus` (1e9 × CPU).

## Caching strategy

We do **not** currently cache Docker layers across deployments. The build container is destroyed after each build (`AutoRemove: true`).

A future optimization (Stage 3.2) will mount a persistent Docker volume per-project so that `node_modules` and similar caches survive across builds.

## Failure modes

| Symptom | Likely cause | Where to look |
|---------|--------------|---------------|
| `Could not detect framework` | Repo doesn't match any supported template. | `services/framework-detector.ts`. |
| Build OOM | `DEPLOX_BUILD_MEMORY` too low for project size. | Increase or refactor project. |
| Container exits immediately | Missing runtime deps in image (e.g. python app needs `gunicorn`). | Per-framework `Dockerfile` template in `docker/real.ts`. |
| Port exhausted | All `9001-9999` in use. | Stop a deployment or widen the env var. |

## Local dev without Docker

`DEPLOX_MOCK_DOCKER=1` switches the API to `MockDockerProvider` (see `services/docker/mock.ts`). It simulates builds with realistic-looking log lines and tracks "containers" in an in-memory Map. Useful for iterating on the orchestration layer on machines without Docker installed.

The mock emits periodic "request" log lines so SSE streams have content to display.