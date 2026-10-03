/**
 * Inspects a cloned repository and returns the detected framework.
 *
 * Per DEPLOX_IDEA.md §4 (Step 2 — Auto Framework Detection) and
 * docs/BUILD_SYSTEM.md.
 *
 * Order of preference (highest signal first):
 *   1. next.config.{js,mjs,ts}              → nextjs
 *   2. package.json with react-scripts / vite → react (CRA or Vite)
 *   3. package.json with express/fastify     → node
 *   4. pyproject.toml / requirements.txt    → python
 *   5. go.mod                               → go
 *   6. index.html at repo root              → static
 *
 * Throws FrameworkDetectionError when none match.
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Framework } from '@deplox/shared-types';

export class FrameworkDetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrameworkDetectionError';
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

interface PackageJson {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

async function readPackageJson(dir: string): Promise<PackageJson | null> {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

async function detectNext(dir: string): Promise<boolean> {
  for (const f of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
    if (await fileExists(join(dir, f))) return true;
  }
  const pkg = await readPackageJson(dir);
  return Boolean(pkg?.dependencies?.next || pkg?.devDependencies?.next);
}

async function detectReact(dir: string): Promise<boolean> {
  const pkg = await readPackageJson(dir);
  if (!pkg) return false;
  const hasReact =
    Boolean(pkg.dependencies?.react || pkg.devDependencies?.react);
  if (!hasReact) return false;
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps['next']) return false; // would have been caught as next
  if (
    allDeps['react-scripts'] ||
    allDeps.vite ||
    allDeps['@vitejs/plugin-react']
  ) {
    return true;
  }
  // bare React without a recognised bundler — still treat as react
  return true;
}

async function detectNode(dir: string): Promise<boolean> {
  const pkg = await readPackageJson(dir);
  if (!pkg) return false;
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Boolean(allDeps.express || allDeps.fastify || allDeps.koa || allDeps.hapi);
}

async function detectGo(dir: string): Promise<boolean> {
  return fileExists(join(dir, 'go.mod'));
}

async function detectPython(dir: string): Promise<boolean> {
  if (await fileExists(join(dir, 'pyproject.toml'))) return true;
  if (await fileExists(join(dir, 'requirements.txt'))) return true;
  if (await fileExists(join(dir, 'Pipfile'))) return true;
  return false;
}

async function detectStatic(dir: string): Promise<boolean> {
  return fileExists(join(dir, 'index.html'));
}

/** Inspects a repo directory and returns the detected framework. */
export async function detectFramework(repoDir: string): Promise<Framework> {
  // sanity-check that the directory looks like a repo
  try {
    const entries = await readdir(repoDir);
    if (entries.length === 0) {
      throw new FrameworkDetectionError('Repository directory is empty');
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkDetectionError(`Repository directory does not exist: ${repoDir}`);
    }
    throw err;
  }

  if (await detectNext(repoDir)) return 'nextjs';
  if (await detectReact(repoDir)) return 'react';
  if (await detectNode(repoDir)) return 'node';
  if (await detectPython(repoDir)) return 'python';
  if (await detectGo(repoDir)) return 'go';
  if (await detectStatic(repoDir)) return 'static';

  throw new FrameworkDetectionError(
    'Could not detect a supported framework. Supported: React, Next.js, Node, Python, Go, static HTML.',
  );
}

/** Returns the port the framework's dev/build server is expected to listen on. */
export function defaultPortFor(framework: Framework): number {
  switch (framework) {
    case 'react':
      return 3000;
    case 'nextjs':
      return 3000;
    case 'node':
      return 3000;
    case 'python':
      return 8000;
    case 'go':
      return 8080;
    case 'static':
      return 80;
  }
}