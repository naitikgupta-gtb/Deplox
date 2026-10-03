#!/usr/bin/env node
/**
 * Backfill webhook_secret for any project that doesn't have one yet.
 * Each project gets its own random 32-byte (64 hex char) secret.
 *
 * Usage: node apps/api/scripts/backfill-webhook-secrets.mjs
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '..', '..', '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = /^\s*([^#][^=]*)=(.*)$/.exec(line);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const client = new pg.Client({ connectionString: process.env.DEPLOX_DATABASE_URL });
await client.connect();
const r = await client.query(
  "UPDATE projects SET webhook_secret = encode(gen_random_bytes(32), 'hex') WHERE webhook_secret IS NULL RETURNING id, substring(webhook_secret, 1, 8) AS prefix",
);
console.log(`Updated ${r.rowCount} rows`);
for (const row of r.rows) console.log(`  ${row.id}  prefix=${row.prefix}…`);
await client.end();