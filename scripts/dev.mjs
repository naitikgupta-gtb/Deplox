// DEPLOX dev runner — starts the API, Vite, and worker dev processes for the
// monorepo WITHOUT going through pnpm.cmd. pnpm.cmd is a .bat shim that
// always opens a cmd.exe window briefly on Windows (even with
// windowsHide:true on the spawn, the .bat re-exec pattern creates a fresh
// cmd.exe that does not inherit the flag), which is what the user sees
// flashing on their screen.
//
// Instead of `pnpm --filter X run dev`, we read the dev script out of each
// app's package.json and execute it directly with `npx`. No cmd.exe, no
// .bat shim, no flash. `windowsHide: true` on the child node process is
// belt-and-suspenders for any subprocess the dev tool might spawn.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const deplox = resolve(here, '..');

const APPS = [
  { name: 'api',    cwd: 'apps/api',    scriptKey: 'dev' },
  { name: 'web',    cwd: 'apps/web',    scriptKey: 'dev' },
  { name: 'worker', cwd: 'apps/worker', scriptKey: 'dev' },
];

// Read each app's dev script from its package.json and tokenize it. We
// support the common cases:
//   "dev": "tsx watch --env-file=../../.env src/index.ts"
//   "dev": "vite --port 5173 --host"
// The script string is split on whitespace, respecting double quotes so
// paths with spaces (none today, but cheap to be safe) stay one token.
function tokenizeScript(script) {
  const tokens = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    if (c === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && /\s/.test(c)) {
      if (cur) { tokens.push(cur); cur = ''; }
      continue;
    }
    cur += c;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function loadAppDevScript(app) {
  const pkgPath = join(deplox, app.cwd, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const script = pkg.scripts?.[app.scriptKey];
  if (!script) throw new Error(`no "${app.scriptKey}" script in ${pkgPath}`);
  return tokenizeScript(script);
}

function startApp(app) {
  const cwd = resolve(deplox, app.cwd);
  const [bin, ...args] = loadAppDevScript(app);
  // Resolve to an absolute path if it's a local dep (npx-style). tsx and
  // vite are both deps of @deplox/api / @deplox/web in node_modules.
  // Spawning them with `npx` would re-introduce the .cmd shim, so we
  // skip npx and call node_modules/.bin/<bin> directly.
  const binPath = join(cwd, 'node_modules', '.bin', bin + (process.platform === 'win32' ? '.cmd' : ''));
  const useShell = process.platform === 'win32' && binPath.endsWith('.cmd');

  const child = spawn(
    useShell ? binPath : process.execPath, // node for .js, cmd for .cmd
    useShell ? args : [binPath, ...args],
    {
      cwd,
      shell: useShell,
      windowsHide: true,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, FORCE_COLOR: '1' },
    },
  );

  child.on('exit', (code, signal) => {
    console.error(`[dev] ${app.name} exited code=${code} signal=${signal} — killing siblings`);
    for (const other of children) {
      if (other !== child && other.exitCode === null) {
        try { other.kill('SIGTERM'); } catch {}
      }
    }
    setTimeout(() => process.exit(code ?? 1), 1500);
  });

  console.log(`[dev] started ${app.name} (pid ${child.pid}) via ${useShell ? binPath : process.execPath} ${args.join(' ')}`);
  return child;
}

const children = APPS.map(startApp);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const c of children) {
      if (c.exitCode === null) {
        try { c.kill(sig); } catch {}
      }
    }
    setTimeout(() => process.exit(0), 500);
  });
}