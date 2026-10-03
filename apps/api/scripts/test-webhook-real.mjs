import { createHmac } from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCb);
const __dirname_ = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dirname_, '..', '..', '..', '.env'), 'utf8').split('\n')) {
  const m = /^\s*([^#][^=]*)=(.*)$/.exec(line);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const projectId = '3393026e-a764-456e-8759-086ef7825575';

const c = new pg.Client({ connectionString: process.env.DEPLOX_DATABASE_URL });
await c.connect();
const { rows: [row] } = await c.query(
  'SELECT webhook_secret, default_branch, github_repo_full_name, github_access_token_encrypted FROM projects WHERE id = $1',
  [projectId],
);

// Use git ls-remote to get the actual SHA on the default branch (no API rate limit).
const url = `https://github.com/${row.github_repo_full_name}.git`;
const { stdout } = await execFile('git', ['ls-remote', url, `refs/heads/${row.default_branch}`]);
const realSha = stdout.split('\t')[0].trim();
console.log(`Latest commit on ${row.github_repo_full_name}@${row.default_branch}: ${realSha.slice(0, 7)}`);

// Construct + sign a payload with the real SHA.
const payload = JSON.stringify({
  ref: `refs/heads/${row.default_branch}`,
  after: realSha,
  head_commit: {
    id: realSha,
    message: 'webhook real-SHA E2E test',
    author: { name: 'deplox-test', email: 'test@deplox.local' },
  },
  repository: { full_name: row.github_repo_full_name },
});
const sig = 'sha256=' + createHmac('sha256', row.webhook_secret).update(payload).digest('hex');

// POST to local webhook.
const res = await fetch(`http://localhost:8080/webhooks/github/${projectId}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig },
  body: payload,
});
console.log(`Webhook response: ${res.status}  ${await res.text()}`);
await c.end();