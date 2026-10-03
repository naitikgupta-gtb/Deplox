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
const r = await c.query(`
  SELECT p.id, p.name, p.github_repo_full_name, p.framework, p.custom_domain,
         d.id AS deployment_id, d.commit_sha, d.status, d.error_message, d.host_port, d.public_url
  FROM projects p
  LEFT JOIN deployments d ON d.project_id = p.id
  WHERE p.github_repo_full_name ILIKE '%attendance%' OR p.name ILIKE '%attendance%'
  ORDER BY d.started_at DESC NULLS LAST
`);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();