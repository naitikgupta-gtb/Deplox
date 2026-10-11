// DEPLOX dev runner — starts the API, Vite, and worker dev processes for the
// monorepo WITHOUT going through pnpm.cmd or the .cmd shims under
// node_modules/.bin. pnpm.cmd and .cmd batch files on Windows force the
// kernel to spawn cmd.exe, which is a console app and ALWAYS allocates a
// console window briefly even when the parent passes windowsHide:true
// (the CREATE_NO_WINDOW flag is not inherited through the cmd.exe
// intermediate). This is the blank black "Command Prompt" the user kept
// seeing on the desktop every time pnpm dev restarted.
//
// Instead, for each app we read its dev script out of package.json,
// resolve the first token (e.g. "tsx", "vite") to the actual JS entry
// point by reading the package's `bin` field via require.resolve, and
// then spawn `node` with that file. No .cmd, no cmd.exe, no flash.
// windowsHide:true on a direct node child reliably hides the console.
//
// If a bin can't be resolved we fall back to the .cmd shim with
// shell:false + windowsHide:true (which still flashes but at least
// keeps the dev process working while we report the missing dep).

import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const deplox = resolve(here, '..');

const APPS = [
  { name: 'api',    cwd: 'apps/api',    scriptKey: 'dev' },
  { name: 'web',    cwd: 'apps/web',    scriptKey: 'dev' },
  { name: 'worker', cwd: 'apps/worker', scriptKey: 'dev' },
];

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

// Resolve a bin name (e.g. "tsx") to the absolute path of the JS entry
// point the package's `bin` field declares, by walking up from the app
// cwd to find the package via Node's resolution algorithm. Returns
// null if not found — caller falls back to .cmd shim.
function resolveBinEntry(cwd, binName) {
  try {
    const require = createRequire(join(cwd, 'noop.js'));
    const pkgJsonPath = require.resolve(`${binName}/package.json`, { paths: [cwd] });
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[binName];
    if (!binRel) return null;
    const pkgDir = dirname(pkgJsonPath);
    return join(pkgDir, binRel);
  } catch {
    return null;
  }
}

const children = [];

function startApp(app) {
  const cwd = resolve(deplox, app.cwd);
  const [bin, ...args] = loadAppDevScript(app);
  const entry = resolveBinEntry(cwd, bin);

  let child;
  if (entry && existsSync(entry)) {
    // Direct: spawn node with the package's actual JS entry. No cmd.exe
    // intermediate, so windowsHide:true works and the kernel gives the
    // child no console.
    child = spawn(
      process.execPath,
      [entry, ...args],
      {
        cwd,
        windowsHide: true,
        stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env, FORCE_COLOR: '1' },
      },
    );
    console.log(`[dev] ${app.name}: node ${entry} ${args.join(' ')}`);
  } else {
    // Fallback: use the .cmd shim via shell:false. windowsHide still
    // works on the direct cmd.exe child, but the .cmd re-exec pattern
    // means a brief window can appear. Better than nothing.
    const binPath = join(cwd, 'node_modules', '.bin', bin + '.cmd');
    console.warn(`[dev] ${app.name}: could not resolve ${bin} entry — falling back to ${binPath}`);
    child = spawn(
      'cmd.exe',
      ['/d', '/s', '/c', `"${binPath}" ${args.map(a => `"${a}"`).join(' ')}`],
      {
        cwd,
        windowsHide: true,
        stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env, FORCE_COLOR: '1' },
        windowsVerbatimArguments: true,
      },
    );
    console.log(`[dev] ${app.name}: cmd.exe ${binPath} ${args.join(' ')}`);
  }

  child.on('exit', (code, signal) => {
    console.error(`[dev] ${app.name} exited code=${code} signal=${signal} - killing siblings`);
    for (const other of children) {
      if (other !== child && other.exitCode === null) {
        try { other.kill('SIGTERM'); } catch {}
      }
    }
    setTimeout(() => process.exit(code ?? 1), 1500);
  });

  children.push(child);
  return child;
}

for (const app of APPS) {
  try {
    startApp(app);
  } catch (e) {
    console.error(`[dev] failed to start ${app.name}: ${e.message}`);
    process.exit(1);
  }
}

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