# ENVIRONMENT_VARIABLES.md

DEPLOX uses a single `.env` file at the repo root (see `.env.example`). Values are validated by Zod at process start (`packages/shared-config/src/index.ts`); invalid configs fail loudly with a list of which keys are wrong.

## Variable reference

| Variable | Default | Stage | Description |
|----------|---------|-------|-------------|
| `DEPLOX_MOCK_DOCKER` | `1` | dev | When `1`, the API uses the in-memory Docker mock. Set to `0` in production. |
| `DEPLOX_API_PORT` | `8080` | all | Fastify listen port. |
| `DEPLOX_WEB_PORT` | `5173` | dev | Vite dev server port. |
| `DEPLOX_CADDY_PORT` | `8000` | all | Public reverse proxy port. |
| `DEPLOX_DEPLOY_PORT_RANGE_START..END` | `9001..9999` | all | Host ports allocated to runtime containers. |
| `DEPLOX_DATABASE_URL` | `postgres://deplox:deplox@localhost:5432/deplox` | all | Postgres DSN. |
| `DEPLOX_REDIS_URL` | `redis://localhost:6379` | all | Redis DSN. |
| `DEPLOX_SESSION_SECRET` | required | all | Server-side session signing key (currently used only as a sanity-check length gate; signing keys are generated per-session). |
| `DEPLOX_ENCRYPTION_KEY` | required | all | 64 hex chars = 32 bytes for AES-256-GCM env-var encryption. |
| `DEPLOX_GITHUB_CLIENT_ID` | empty | all | GitHub OAuth app client ID. |
| `DEPLOX_GITHUB_CLIENT_SECRET` | empty | all | GitHub OAuth app client secret. |
| `DEPLOX_GITHUB_CALLBACK_URL` | `http://localhost:8080/auth/github/callback` | all | Must match the OAuth app exactly. |
| `DEPLOX_CADDY_ADMIN_URL` | `http://localhost:2019` | all | Used to register custom domains. |
| `DEPLOX_CADDY_API_TOKEN` | empty | prod | Bearer token for the Caddy admin API. |
| `DEPLOX_LOG_LEVEL` | `info` | all | Pino level. |
| `DEPLOX_LOG_PRETTY` | `1` | dev | Use `pino-pretty`. |
| `DEPLOX_BUILD_CPU` | `2` | all | CPUs per build container. |
| `DEPLOX_BUILD_MEMORY` | `2g` | all | Memory per build container. |
| `DEPLOX_RUNTIME_CPU` | `1` | all | CPUs per runtime container. |
| `DEPLOX_RUNTIME_MEMORY` | `512m` | all | Memory per runtime container. |
| `DEPLOX_BUILD_TIMEOUT_SECONDS` | `900` | all | Hard limit on build wall-time. |
| `DEPLOX_RUNTIME_IDLE_TIMEOUT_SECONDS` | `600` | Stage 3 | Stop a container after N minutes with no traffic. |
| `DEPLOX_PUBLIC_URL` | `http://localhost:8000` | all | Used by CORS allowlist. |

## Generating the secrets

```bash
# 32-byte random hex key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do this once on first setup. **Rotating the encryption key** requires decrypting all rows in `env_vars` with the old key and re-encrypting with the new one — see `OPERATIONS.md#rotating-DEPLOX_ENCRYPTION_KEY`.

## User-supplied env vars

These are *not* in `.env`. They are set per-project via the dashboard and decrypted only at runtime.

- Stored encrypted in the `env_vars` table.
- Injected into the runtime container as `Env=[...]` at `docker run` time.
- **Never** passed to `docker build`.
- Are redacted by the logger.

The key format is `UPPER_SNAKE_CASE`, max 63 chars, validated by `KeySchema` in `routes/env.ts`.