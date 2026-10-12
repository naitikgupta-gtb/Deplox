#!/usr/bin/env node
/**
 * IndexNow submission for deplox.site.
 *
 * IndexNow is a Bing + Yandex protocol that pings search engines the
 * moment a URL is created or updated. Bing re-crawls within minutes
 * (vs the usual days/weeks). Single endpoint, no API key signup, just
 * a self-generated hex key served at https://<host>/<key>.txt.
 *
 * Usage:
 *   node scripts/indexnow-submit.mjs                       # submit default public URLs
 *   node scripts/indexnow-submit.mjs --url <url> [...]     # submit explicit URLs
 *   node scripts/indexnow-submit.mjs --auto-deploy <url>   # single-URL after a deploy
 *
 * Env:
 *   DEPLOX_INDEXNOW_KEY  (default: reads apps/web/public/indexnow-key.txt)
 *
 * Refs:
 *   https://www.indexnow.org/documentation
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const KEY_FILE = resolve(REPO_ROOT, 'apps', 'web', 'public', 'indexnow-key.txt');

const HOST = 'deplox.site';
const KEY_LOCATION = `https://${HOST}/indexnow-key.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const DEFAULT_URLS = [
  'https://deplox.site/',
  'https://deplox.site/pricing',
  'https://deplox.site/docs',
  'https://deplox.site/about',
  'https://deplox.site/changelog',
  'https://deplox.site/status',
  'https://deplox.site/founding',
];

function readKey() {
  if (process.env.DEPLOX_INDEXNOW_KEY) return process.env.DEPLOX_INDEXNOW_KEY.trim();
  if (!existsSync(KEY_FILE)) {
    throw new Error(
      `IndexNow key not found. Set DEPLOX_INDEXNOW_KEY env var or create ${KEY_FILE}.`,
    );
  }
  return readFileSync(KEY_FILE, 'utf8').trim();
}

function parseArgs(argv) {
  const out = { urls: [], autoDeploy: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') {
      const v = argv[++i];
      if (v) out.urls.push(v);
    } else if (a === '--auto-deploy') {
      out.autoDeploy = argv[++i] ?? null;
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/indexnow-submit.mjs [--url <url> ...] [--auto-deploy <url>]',
      );
      process.exit(0);
    }
  }
  return out;
}

function validateUrl(u) {
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return `not a URL: ${u}`;
  }
  if (parsed.hostname !== HOST) {
    return `wrong host (${parsed.hostname}, expected ${HOST}): ${u}`;
  }
  if (parsed.protocol !== 'https:') {
    return `not https: ${u}`;
  }
  return null;
}

async function submit(urls, key) {
  const body = {
    host: HOST,
    key,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function main() {
  const args = parseArgs(process.argv);
  const key = readKey();

  let urls = args.urls;
  if (args.autoDeploy) urls.push(args.autoDeploy);
  if (urls.length === 0) urls = DEFAULT_URLS;

  // Dedupe + validate.
  const seen = new Set();
  const final = [];
  for (const u of urls) {
    if (seen.has(u)) continue;
    const err = validateUrl(u);
    if (err) {
      console.warn(`skip: ${err}`);
      continue;
    }
    seen.add(u);
    final.push(u);
  }

  if (final.length === 0) {
    console.error('no valid URLs to submit');
    process.exit(2);
  }

  console.log(`submitting ${final.length} URL(s) to IndexNow (key ${key.slice(0, 8)}…)`);
  const { status, body } = await submit(final, key);

  // IndexNow status codes:
  //   200 — URL(s) submitted successfully
  //   202 — URL(s) submitted, but key not yet validated (will be retried)
  //   400 — bad request (malformed payload)
  //   403 — key not found at keyLocation
  //   422 — key not validated yet (crawl pending)
  //   429 — too many requests (rate-limited; back off)
  const ok = status === 200 || status === 202;
  if (ok) {
    console.log(`ok: HTTP ${status}`);
  } else {
    console.error(`fail: HTTP ${status} — ${body.slice(0, 200)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`error: ${err.message ?? err}`);
  process.exit(1);
});
