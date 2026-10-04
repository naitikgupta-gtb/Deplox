#!/usr/bin/env node
/**
 * DEPLOX public-tunnel helper (₹0, no Cloudflare account required).
 *
 * Starts a Cloudflare quick tunnel pointing at the Vite dev server (5173),
 * detects the random *.trycloudflare.com URL from cloudflared's stdout, and
 * patches .env so DEPLOX knows its public URL (OAuth callback, CORS, etc).
 *
 * Usage:
 *   node scripts/tunnel-public.mjs                # start tunnel + (re)start dev
 *   node scripts/tunnel-public.mjs --tunnel-only  # only tunnel
 *
 * Works on Windows (PowerShell) and POSIX shells. Once started, the public
 * URL stays stable for the lifetime of the cloudflared process — but it WILL
 * change on every restart, so we keep this script around for the day the user
 * buys a ~$1 domain and we switch to a named tunnel.
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const TUNNEL_ONLY = process.argv.includes('--tunnel-only');
const DEV_PORT = 5173;

function findCloudflared() {
  const candidates = [
    'C:\\Users\\naiti\\bin\\cloudflared.exe',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];
  return candidates.find((p) => {
    try {
      // sync check via fs.existsSync-ish
      return require('node:fs').existsSync(p);
    } catch {
      return false;
    }
  }) ?? 'cloudflared';
}

async function killExistingCloudflared() {
  await new Promise((resolveKill) => {
    const killer = spawn('taskkill', ['/F', '/IM', 'cloudflared.exe'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.on('exit', () => resolveKill());
    setTimeout(resolveKill, 2000);
  });
}

async function killExistingDevServer() {
  // Best-effort: kill node processes whose argv mentions pnpm or our src/index.ts.
  await new Promise((resolveKill) => {
    const killer = spawn(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'pnpm|tsx.*src/index' } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }",
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    killer.on('exit', () => resolveKill());
    setTimeout(resolveKill, 5000);
  });
}

function startTunnel() {
  const bin = findCloudflared();
  console.log(`[tunnel] using cloudflared: ${bin}`);
  const child = spawn(bin, ['tunnel', '--url', `http://localhost:${DEV_PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return child;
}

function startDevServer() {
  console.log('[dev] starting pnpm dev in a new terminal');
  if (process.platform === 'win32') {
    // Spawn a NEW PowerShell window so the user can see pnpm dev output.
    // The `Start-Process` PowerShell cmdlet with -PassThru returns a process
    // object whose handle we can detach; the new window stays open after we exit.
    spawn(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '${repoRoot}'; pnpm dev" -WindowStyle Normal`,
      ],
      { stdio: 'ignore', detached: true, windowsHide: true },
    ).unref();
  } else {
    spawn('pnpm', ['dev'], {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  }
}

async function updateEnv(url) {
  const envPath = resolve(repoRoot, '.env');
  const original = await readFile(envPath, 'utf8');
  const patch = (line) => {
    if (line.startsWith('DEPLOX_PUBLIC_URL=')) return `DEPLOX_PUBLIC_URL=${url}`;
    if (line.startsWith('DEPLOX_WEB_URL=')) return `DEPLOX_WEB_URL=${url}`;
    if (line.startsWith('DEPLOX_GITHUB_CALLBACK_URL='))
      return `DEPLOX_GITHUB_CALLBACK_URL=${url}/auth/github/callback`;
    return line;
  };
  const next = original.split(/\r?\n/).map(patch).join('\n');
  // Write atomically via rename to avoid clobbering on crash.
  const tmp = envPath + '.tmp';
  await writeFile(tmp, next, 'utf8');
  await rename(tmp, envPath);
  console.log(`[env] .env updated`);
}

function waitForUrl(child) {
  return new Promise((resolveUrl, rejectUrl) => {
    const timer = setTimeout(() => rejectUrl(new Error('No URL in 60s')), 60_000);
    const onChunk = (buf) => {
      const text = buf.toString('utf8');
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
      if (m) {
        clearTimeout(timer);
        resolveUrl(m[0]);
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('exit', (code) => {
      clearTimeout(timer);
      rejectUrl(new Error(`cloudflared exited early (${code})`));
    });
  });
}

async function main() {
  console.log('[tunnel] killing any existing cloudflared...');
  await killExistingCloudflared();

  if (!TUNNEL_ONLY) {
    console.log('[dev] killing existing dev server processes (best-effort)...');
    await killExistingDevServer();
  }

  const tunnel = startTunnel();

  let url;
  try {
    url = await waitForUrl(tunnel);
  } catch (err) {
    console.error('[tunnel] failed:', err.message);
    process.exit(1);
  }

  console.log(`\n[TUNNEL URL] ${url}\n`);
  await updateEnv(url);

  if (!TUNNEL_ONLY) {
    startDevServer();
    console.log('[dev] dev server starting in a new window — visit the URL once it boots (~10s)');
  }

  console.log('\nTip: keep this script running. Stop with Ctrl+C.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});