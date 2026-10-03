#!/usr/bin/env node
/**
 * E2E webhook test.
 *
 * Reads the project's webhook_secret from NeonDB, then exercises the local
 * webhook endpoint with three payloads:
 *   1. Properly-signed push to default branch  → 202 + deployment row inserted
 *   2. Bogus signature                       → 401
 *   3. Properly-signed push to wrong branch  → 202 ignored (no deployment)
 *
 * Usage: node scripts/test-webhook.mjs <projectId>
 *
 * Reads DATABASE_URL from .env at the project root.
 */

import { createHmac } from 'node:crypto';
import pg from 'pg';

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// -- load .env --------------------------------------------------------------
function loadEnv() {
  // .env lives at the workspace root (../../.env from this script).
  const path = resolve(__dirname, '..', '..', '..', '.env');
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([^#][^=]*)=(.*)$/.exec(line);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}
loadEnv();

const projectId = process.argv[2];
if (!projectId) {
  console.error('Usage: node scripts/test-webhook.mjs <projectId>');
  process.exit(1);
}

// -- fetch secret from DB ----------------------------------------------------
const client = new pg.Client({ connectionString: process.env.DEPLOX_DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  'SELECT webhook_secret, default_branch, auto_deploy FROM projects WHERE id = $1',
  [projectId],
);
await client.end();
if (!rows[0]) {
  console.error('Project not found');
  process.exit(1);
}
const row = rows[0];
const { webhook_secret: secret } = row;
console.log(`Project ${projectId}  branch=${row.default_branch}  auto_deploy=${row.auto_deploy}`);
console.log(`Secret length: ${secret.length}`);

// -- helper: sign + post ----------------------------------------------------
function sign(body, key) {
  return 'sha256=' + createHmac('sha256', key).update(body).digest('hex');
}

async function post(label, body, signature) {
  const url = `http://localhost:8080/webhooks/github/${projectId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-hub-signature-256': signature } : {}),
    },
    body,
  });
  const text = await res.text();
  console.log(`\n=== ${label} ===`);
  console.log(`status: ${res.status}`);
  console.log(`body:   ${text}`);
  return { status: res.status, text };
}

// -- 1. valid push to default branch ----------------------------------------
const basePayload = JSON.stringify({
  ref: `refs/heads/${rows[0].default_branch}`,
  after: 'deadbeefcafebabe1234567890abcdef12345678',
  head_commit: {
    id: 'deadbeefcafebabe1234567890abcdef12345678',
    message: 'test: webhook delivery from local script',
    author: { name: 'DEPLOX Test', email: 'test@deplox.local' },
  },
  repository: { full_name: 'test/test' },
});
await post('valid push to default branch', basePayload, sign(basePayload, secret));

// -- 2. bogus signature ------------------------------------------------------
await post(
  'bogus signature (expect 401)',
  basePayload,
  'sha256=' + '0'.repeat(64),
);

// -- 3. wrong branch ---------------------------------------------------------
const wrongBranch = basePayload.replace(
  /"refs\/heads\/[^"]+"/,
  '"refs/heads/some-feature-branch"',
);
await post('wrong branch (expect 202 ignored)', wrongBranch, sign(wrongBranch, secret));

// -- 4. malformed JSON -------------------------------------------------------
const res4 = await fetch(`http://localhost:8080/webhooks/github/${projectId}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign('not json', secret) },
  body: 'not json',
});
console.log(`\n=== malformed JSON (expect 400) ===`);
console.log(`status: ${res4.status}`);
console.log(`body:   ${await res4.text()}`);

console.log('\nDone.');