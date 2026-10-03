/**
 * DEPLOX shared environment configuration.
 *
 * Validated with Zod so that any package can safely `import { config } from
 * '@deplox/shared-config'` and trust the values.
 *
 * NOTE: this module reads `process.env` lazily. It does NOT mutate it.
 */

import { z } from 'zod';

const hex32 = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)');

const cpuCount = z.coerce.number().int().min(1).max(64);

const memoryString = z
  .string()
  .regex(/^\d+(?:\.\d+)?(?:m|g)$/i, 'must look like "512m" or "2g"');

const port = z.coerce.number().int().min(1).max(65535);

const Schema = z.object({
  // Mode — `z.coerce.boolean()` treats the string "0" as truthy, so we
  // explicitly parse "1"/"true" as true and everything else as false.
  DEPLOX_MOCK_DOCKER: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => v === '1' || v === 'true' || v === true)
    .default('0'),

  // Server ports
  DEPLOX_API_PORT: port.default(8080),
  DEPLOX_WEB_PORT: port.default(5173),
  DEPLOX_CADDY_PORT: port.default(8000),
  DEPLOX_DEPLOY_PORT_RANGE_START: port.default(9001),
  DEPLOX_DEPLOY_PORT_RANGE_END: port.default(9999),

  // Database & cache
  DEPLOX_DATABASE_URL: z.string().url(),
  DEPLOX_REDIS_URL: z.string().url(),

  // Secrets
  DEPLOX_SESSION_SECRET: z.string().min(32),
  DEPLOX_ENCRYPTION_KEY: hex32,

  // GitHub OAuth
  DEPLOX_GITHUB_CLIENT_ID: z.string().default(''),
  DEPLOX_GITHUB_CLIENT_SECRET: z.string().default(''),
  DEPLOX_GITHUB_CALLBACK_URL: z.string().url(),

  // Caddy (only required for custom domains, not strictly enforced)
  DEPLOX_CADDY_ADMIN_URL: z.string().url().default('http://localhost:2019'),
  DEPLOX_CADDY_API_TOKEN: z.string().default(''),

  // Logging
  DEPLOX_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  DEPLOX_LOG_PRETTY: z.coerce.boolean().default(true),

  // Resource limits
  DEPLOX_BUILD_CPU: cpuCount.default(2),
  DEPLOX_BUILD_MEMORY: memoryString.default('2g'),
  DEPLOX_RUNTIME_CPU: cpuCount.default(1),
  DEPLOX_RUNTIME_MEMORY: memoryString.default('512m'),
  DEPLOX_BUILD_TIMEOUT_SECONDS: z.coerce.number().int().min(30).default(900),
  DEPLOX_RUNTIME_IDLE_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .default(600),

  // Public base URL
  DEPLOX_PUBLIC_URL: z.string().url(),

  // Web origin (for post-OAuth redirects). Defaults to the public URL.
  DEPLOX_WEB_URL: z.string().url().optional(),

  // Webhook fallback secret — used only when a project has no per-project
  // webhookSecret set. We accept it as optional; if absent, webhooks will be
  // rejected with 503 to avoid silently accepting unverified payloads.
  DEPLOX_WEBHOOK_HMAC_FALLBACK_SECRET: z.string().min(16).optional(),
});

export type DeploxConfig = Readonly<z.infer<typeof Schema>>;

let cached: DeploxConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DeploxConfig {
  if (cached) return cached;

  const result = Schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid DEPLOX environment configuration:\n${issues}\n\n` +
        `See .env.example for the expected shape.`,
    );
  }

  cached = Object.freeze(result.data);
  return cached;
}

/** Test-only — clears the cache between test cases. */
export function _resetConfigForTests(): void {
  cached = null;
}

/**
 * Parses `512m` / `2g` style strings into bytes for cgroup/passes/mem limits.
 */
export function parseMemoryString(s: string): number {
  const m = /^(\d+(?:\.\d+)?)(m|g)$/i.exec(s);
  if (!m) throw new Error(`Invalid memory string: ${s}`);
  const [, num, unit] = m as unknown as [string, string, string];
  const n = Number(num);
  return unit.toLowerCase() === 'g' ? n * 1024 * 1024 * 1024 : n * 1024 * 1024;
}