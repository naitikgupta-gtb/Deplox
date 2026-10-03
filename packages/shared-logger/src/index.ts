/**
 * DEPLOX shared logger.
 *
 * Wraps Pino with:
 *   - automatic redaction of common secret key patterns (token, secret, key, etc.)
 *   - a friendly pretty-printer in dev
 *   - a strict JSON logger in prod
 *
 * Per DEPLOX_SECURITY_ARCHITECTURE.md §8 — "Build logs auto-redact secrets."
 */

import pino, { type Logger, type LoggerOptions } from 'pino';
import { loadConfig } from '@deplox/shared-config';

const SECRET_PATHS = [
  '*.token',
  '*.access_token',
  '*.accessToken',
  '*.refresh_token',
  '*.refreshToken',
  '*.secret',
  '*.client_secret',
  '*.clientSecret',
  '*.password',
  '*.private_key',
  '*.privateKey',
  '*.authorization',
  '*.cookie',
  '*.githubAccessToken',
  '*.githubAccessTokenEncrypted',
  '*.encryptedValue',
  '*.DEPLOX_ENCRYPTION_KEY',
  '*.DEPLOX_SESSION_SECRET',
  '*.DEPLOX_GITHUB_CLIENT_SECRET',
  '*.DEPLOX_CADDY_API_TOKEN',
  'res.headers["set-cookie"]',
  'req.headers.cookie',
  'req.headers.authorization',
];

const BASE_OPTIONS: LoggerOptions = {
  redact: { paths: SECRET_PATHS, censor: '[REDACTED]' },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

function build(): Logger {
  let cfg;
  try {
    cfg = loadConfig();
  } catch {
    // If env is missing (e.g. during early scaffolding), fall back to defaults.
    cfg = null;
  }

  if (cfg?.DEPLOX_LOG_PRETTY) {
    // Use pino-pretty when available; if not installed, fall back to JSON.
    try {
      // dynamic require keeps `pino-pretty` an optional dep
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pretty = require('pino-pretty');
      const stream = pretty({ colorize: true, translateTime: 'SYS:HH:MM:ss.l' });
      return pino({
        ...BASE_OPTIONS,
        level: cfg?.DEPLOX_LOG_LEVEL ?? 'info',
      }, stream as unknown as pino.DestinationStream);
    } catch {
      return pino({ ...BASE_OPTIONS, level: cfg?.DEPLOX_LOG_LEVEL ?? 'info' });
    }
  }

  return pino({
    ...BASE_OPTIONS,
    level: cfg?.DEPLOX_LOG_LEVEL ?? 'info',
  });
}

/** Cached root logger. */
let rootLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!rootLogger) rootLogger = build();
  return rootLogger;
}

/**
 * Returns a child logger with the given bindings (e.g. request id, deployment id).
 * Use this everywhere — never `console.log` in DEPLOX.
 */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}

/**
 * Redacts a free-form string by replacing values that *look* like tokens.
 *
 * This is a best-effort guard for log lines that may have already been
 * concatenated with secrets before reaching the logger. The structured-logger
 * redaction above is the primary defense.
 */
export function redactString(input: string): string {
  // Hex 32+ chars
  // eslint-disable-next-line no-magic-numbers
  let out = input.replace(/[a-f0-9]{32,}/gi, '[REDACTED-HEX]');
  // JWT-ish: header.payload.signature
  out = out.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED-JWT]');
  // GitHub PATs (ghp_, gho_, ghu_, ghs_, ghr_)
  out = out.replace(/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, '[REDACTED-TOKEN]');
  // Bearer tokens
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  // Basic auth
  out = out.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]');
  return out;
}

export type { Logger };