import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dirname, '..', '..', '..', '.env'), 'utf8').split('\n')) {
  const m = /^\s*([^#][^=]*)=(.*)$/.exec(line);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const c = new pg.Client({ connectionString: process.env.DEPLOX_DATABASE_URL });
await c.connect();
const r = await c.query(
  "SELECT id, status, error_message, substring(build_logs, 1, 600) as logs FROM deployments WHERE id = '3d48aed1-de68-4519-a3a1-d555d7355244'",
);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();