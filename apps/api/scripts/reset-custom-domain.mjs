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
await c.query("UPDATE projects SET custom_domain = NULL WHERE id = '3393026e-a764-456e-8759-086ef7825575'");
console.log('reset custom_domain to NULL');
await c.end();