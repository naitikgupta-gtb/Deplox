/**
 * DEPLOX worker.
 *
 * Thin wrapper that imports the API's worker-entry so we can scale the
 * worker process horizontally without depending on the API app.
 *
 * Run with `pnpm --filter @deplox/worker run dev` or
 * `pnpm dev:worker`.
 */

// We deliberately don't reimplement the worker here — the orchestrator and
// providers all live under apps/api so the deploy lifecycle is in one
// codebase.
import '@deplox/api/worker-entry';