/**
 * IndexNow pinger.
 *
 * When a deployment transitions to "running" and gets a publicUrl, we
 * fire a single-URL IndexNow submission so search engines (Bing, Yandex,
 * DuckDuckGo via Bing) re-crawl the new URL within minutes.
 *
 * Refs: https://www.indexnow.org/documentation
 *
 * Design notes:
 *   - The submission is fire-and-forget; failure here must NEVER roll back
 *     or fail the deployment. The user already has a working site.
 *   - We only ping URLs we own (deplox.site / *.deplox.site). Custom domains
 *     belong to the user — we don't ping those on their behalf.
 *   - The key file is served at https://deplox.site/indexnow-key.txt by
 *     Vite (apps/web/public/indexnow-key.txt). On a fresh key Bing returns
 *     202 until it crawls and validates the key file.
 */

import { childLogger } from '@deplox/shared-logger';

const log = childLogger({ component: 'indexnow' });

const HOST = 'deplox.site';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

let cachedKey: string | null = null;

function getKey(): string {
  if (cachedKey !== null) return cachedKey;
  // Process env override for staging / future multi-host setups.
  const envKey = process.env.DEPLOX_INDEXNOW_KEY?.trim();
  if (envKey) {
    cachedKey = envKey;
    return envKey;
  }
  // Read the key file shipped in apps/web/public/indexnow-key.txt at
  // build time. We resolve relative to the repo root — the API is
  // compiled into apps/api/dist, but the key file is co-located with
  // apps/web which is two levels up. resolve() from process.cwd() is
  // safest at runtime.
  try {
    // Lazy require so test envs without fs still work.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolve } = require('node:path') as typeof import('node:path');
    const candidates = [
      resolve(process.cwd(), 'apps', 'web', 'public', 'indexnow-key.txt'),
      resolve(process.cwd(), '..', 'apps', 'web', 'public', 'indexnow-key.txt'),
      resolve(__dirname, '..', '..', '..', 'web', 'public', 'indexnow-key.txt'),
    ];
    for (const p of candidates) {
      try {
        cachedKey = readFileSync(p, 'utf8').trim();
        if (cachedKey) return cachedKey;
      } catch {
        /* try next */
      }
    }
  } catch {
    /* fall through */
  }
  // If we can't find a key, disable pinging silently. Don't crash the API.
  cachedKey = '';
  return cachedKey;
}

function shouldPing(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return u.hostname === HOST || u.hostname.endsWith(`.${HOST}`);
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget IndexNow submission for a single URL. Errors are logged
 * but never thrown — the deployment must not fail because search engines
 * are flaky.
 */
export function pingIndexNow(url: string): void {
  const key = getKey();
  if (!key) {
    log.debug({ url }, 'indexnow key not configured; skipping');
    return;
  }
  if (!shouldPing(url)) {
    log.debug({ url }, 'url not on deplox.site; skipping indexnow');
    return;
  }
  // Don't await — we explicitly do not block the caller.
  void submit(url, key);
}

async function submit(url: string, key: string): Promise<void> {
  const body = {
    host: HOST,
    key,
    keyLocation: `https://${HOST}/indexnow-key.txt`,
    urlList: [url],
  };
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 200) {
      log.info({ url }, 'indexnow accepted');
    } else if (res.status === 202) {
      // 202 = key validation pending; Bing will retry. Treat as soft-ok.
      log.info({ url, status: 202 }, 'indexnow accepted (key validation pending)');
    } else {
      const text = await res.text();
      log.warn({ url, status: res.status, body: text.slice(0, 200) }, 'indexnow failed');
    }
  } catch (err) {
    log.warn({ err: (err as Error).message, url }, 'indexnow network error');
  }
}
