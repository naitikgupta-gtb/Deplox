import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import Dockerode from 'dockerode';
import { loadConfig, parseMemoryString } from '@deplox/shared-config';
import { redactString } from '@deplox/shared-logger';
import type {
  BuildResult,
  DockerProvider,
  Framework,
  LogChunk,
  RunResult,
} from '@deplox/shared-types';
import { defaultPortFor } from '../framework-detector.js';

const execFile = promisify(execFileCb);

/**
 * The shared Dockerode client. Exported so other services (e.g.
 * `container-self-heal.ts`) can call low-level APIs like `getContainer` and
 * `inspect` directly. The DockerProvider abstraction is for build/run/stop;
 * self-heal needs `inspect` which isn't in the interface and isn't worth
 * adding for one caller.
 */
export const docker = new Dockerode();

const cfg = loadConfig();

const BUILD_IMAGE = 'deplox/build-runner:latest'; // pre-baked in infra/docker/build.Dockerfile

/** Writes a tiny per-framework Dockerfile into the source dir, returns its path. */
async function generateDockerfile(
  framework: Framework,
  sourceDir: string,
  envVars: ReadonlyArray<{ key: string; value: string }> = [],
): Promise<string> {
  let tmpl = await loadTemplate(framework, envVars);
  const target = join(sourceDir, 'Dockerfile.deplox');
  await writeFile(target, tmpl, 'utf8');
  return target;
}

async function loadTemplate(
  framework: Framework,
  envVars: ReadonlyArray<{ key: string; value: string }> = [],
): Promise<string> {
  // In a real install we read from a known absolute path; here we inline a
  // minimal generator that produces correct output for the most common case.
  switch (framework) {
    case 'react': {
      // For Vite builds, we need env vars to be present in the BUILD stage
      // (not just runtime) because Vite inlines `import.meta.env.VITE_*`
      // references at build time. The user often forgets the `VITE_` prefix
      // when adding env vars in the UI, so we auto-derive the VITE_-prefixed
      // form from any non-prefixed key. If the user already provided a
      // VITE_-prefixed key, we use that directly.
      //
      // The orchestrator passes each env var as a Docker --build-arg with
      // the same name as the user's key. The Dockerfile declares matching
      // `ARG` lines (one per env var) and `ENV` lines (one per VITE_ alias)
      // so Vite sees them at build time.
      const argLines: string[] = [];
      const envLines: string[] = [];
      for (const v of envVars) {
        if (!v.key) continue;
        // Sanitize: Docker build-arg names must match [a-zA-Z_][a-zA-Z0-9_]*
        const safeKey = v.key.replace(/[^A-Za-z0-9_]/g, '_');
        argLines.push(`ARG ${safeKey}`);
        if (v.key.startsWith('VITE_')) {
          envLines.push(`ENV ${safeKey}=\$${safeKey}`);
        } else {
          // Auto-derive VITE_<KEY> alias for the user's plain key, so
          // `import.meta.env.VITE_SUPABASE_URL` works whether the user typed
          // VITE_SUPABASE_URL or just SUPABASE_URL.
          const viteAlias = `VITE_${safeKey}`;
          argLines.push(`ARG ${viteAlias}`);
          envLines.push(`ENV ${viteAlias}=\$${viteAlias}`);
          envLines.push(`ENV ${safeKey}=\$${viteAlias}`);
        }
      }
      const argBlock = argLines.join('\n');
      const envExportBlock = envLines.join('\n');
      return `FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
${argBlock}
${envExportBlock}
COPY . .
RUN npm run build
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
    }
    case 'nextjs':
      return `FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
`;
    case 'node':
      // Ember, Express, Fastify, Koa, etc. We ship a tiny entry-point
      // discovery shell script as a separate file in the image, then run
      // it as CMD. We do NOT inject `--host 0.0.0.0` — apps that ignore
      // unknown flags are lucky, and those that don't (strict Express 5)
      // will crash with EADDRINUSE or argv errors.
      //
      // We write the script with `RUN printf '...' > /path`. A SINGLE
      // printf line works in every Dockerfile parser — no heredoc support
      // required (BuildKit needed for `<<EOF`; the classic builder
      // silently produces a 0-byte file). `\n` inside the single-quoted
      // string is interpreted by printf, not the shell.
      const entryScript = [
        '#!/bin/sh',
        'set +e',
        "# 1) npm start if scripts.start exists in package.json",
        "if grep -qE '\"start\"[[:space:]]*:[[:space:]]*[^,}]+' package.json 2>/dev/null; then",
        '  echo "[deplox] starting via npm start"',
        '  exec npm start',
        'fi',
        '# 2) common filenames',
        'for f in server.js index.js src/index.js src/server.js app.js dist/index.js dist/server.js src/app.js; do',
        '  if [ -f "$f" ]; then',
        '    echo "[deplox] starting node $f"',
        '    exec node "$f"',
        '  fi',
        'done',
        "# 3) package.json 'main' field (parse with awk)",
        "main=$(awk -F'\"' '/^[[:space:]]*\"main\"[[:space:]]*:/ { for(i=1;i<=NF;i++) if($i==\"main\"){ print $(i+2); exit } }' package.json 2>/dev/null)",
        'if [ -n "$main" ] && [ -f "$main" ]; then',
        '  echo "[deplox] starting node $main (from package.json:main)"',
        '  exec node "$main"',
        'fi',
        '# 4) first .js file at /app root',
        'firstjs=$(ls -1 *.js 2>/dev/null | head -1)',
        'if [ -n "$firstjs" ]; then',
        '  echo "[deplox] starting node $firstjs (first .js in /app)"',
        '  exec node "$firstjs"',
        'fi',
        '# 5) give up cleanly so the orchestrator sees non-zero exit',
        'echo no-entry-point-found',
        'exit 1',
      ].join('\n');
      // The shell single-quoted string in the RUN line must contain
      // literally-newline-free content (one Dockerfile line = one shell
      // command). We replace real newlines in the script with the escape
      // sequence `\n` and use printf's `%b` format, which interprets
      // backslash-escape sequences in the argument. Single-quoted shell
      // strings don't process the backslash, so `\n` reaches printf as
      // the two characters backslash + n, and printf turns them into
      // real newlines.
      const printfArg = entryScript
        .replace(/\\/g, '\\\\')   // escape any literal backslashes first
        .replace(/'/g, `'\\''`)   // then escape single-quotes for the shell
        .replace(/\n/g, '\\n');   // finally replace newlines with escape seq
      return [
        'FROM node:20-alpine',
        'WORKDIR /app',
        'COPY package*.json ./',
        'RUN npm install --omit=dev || true',
        'COPY . .',
        `RUN printf '%b' '${printfArg}' > /usr/local/bin/deplox-start && chmod +x /usr/local/bin/deplox-start`,
        'EXPOSE 3000',
        'USER node',
        'CMD ["/usr/local/bin/deplox-start"]',
        '',
      ].join('\n');
    case 'python':
      return `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt* pyproject.toml* ./
RUN pip install --no-cache-dir -r requirements.txt || pip install --no-cache-dir .
COPY . .
EXPOSE 8000
USER nobody
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
    case 'go':
      return `FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/app .
FROM alpine:3.20
COPY --from=build /out/app /app
EXPOSE 8080
USER nobody
CMD ["/app"]
`;
    case 'static':
      return `FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
    default: {
      const exhaustive: never = framework;
      throw new Error(`Unknown framework: ${String(exhaustive)}`);
    }
  }
}

export class RealDockerProvider implements DockerProvider {
  async build(opts: {
    deploymentId: string;
    sourceDir: string;
    framework: Framework;
    envVars?: ReadonlyArray<{ key: string; value: string }>;
    onLog?: (chunk: LogChunk) => void;
  }): Promise<BuildResult> {
    const start = Date.now();
    const { deploymentId, sourceDir, framework, onLog, envVars = [] } = opts;

    await generateDockerfile(framework, sourceDir, envVars);
    const imageTag = `deplox/${deploymentId}:${Date.now()}`;

    // Build a tar archive ourselves. Dockerode's built-in tar packer can choke
    // on `.git/` directories (submodules, pack files) with EISDIR errors. Using
    // the system `tar` is faster and handles all edge cases deterministically.
    // We exclude `.git` and `node_modules` from the context; the framework's
    // `npm ci` inside the build step will re-fetch node_modules anyway. We
    // KEEP `Dockerfile.deplox` in the archive — that's what Docker uses.
    const tarPath = join(tmpdir(), `deplox-context-${deploymentId}-${Date.now()}.tar`);
    try {
      await execFile('tar', [
        '--exclude=.git',
        '--exclude=node_modules',
        '-cf', tarPath,
        '-C', sourceDir,
        '.',
      ], {
        maxBuffer: 32 * 1024 * 1024,
        timeout: 60 * 1000,
      });

      // Build args: pass each env var to Docker so the Dockerfile can
      // `ARG <KEY>` and `ENV VITE_<KEY>=...` it. The Dockerfile generator
      // (loadTemplate) already declared matching ARG lines for the
      // framework, so any extra keys here will fail the build with
      // "one or more build args [...] were not consumed" — a strong
      // signal of a typo in the Dockerfile template.
      const buildargs: Record<string, string> = {};
      for (const v of envVars) {
        if (!v.key) continue;
        const safeKey = v.key.replace(/[^A-Za-z0-9_]/g, '_');
        // Always also expose as VITE_-prefixed alias so the user doesn't
        // have to remember the prefix. `VITE_X` keys override the auto-derivation
        // (so a deliberate `VITE_FOO=bar` wins over plain `FOO=bar`).
        if (v.key.startsWith('VITE_')) {
          buildargs[`VITE_${safeKey.slice(5)}`] = v.value;
        }
        buildargs[safeKey] = v.value;
      }

      const buildStream = await docker.buildImage(tarPath, {
        dockerfile: 'Dockerfile.deplox',
        t: imageTag,
        // `src` is required when we pass a file path so Dockerode reads it as a
        // tarball instead of trying to repack a directory.
        src: ['.'],
        buildargs,
      });

      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(
          buildStream,
          (err: Error | null) => (err ? reject(err) : resolve()),
          (event: { stream?: string; error?: string }) => {
            if (event.stream) {
              const text = redactString(event.stream);
              onLog?.({ stream: 'stdout', text });
            } else if (event.error) {
              onLog?.({ stream: 'stderr', text: redactString(event.error) });
            }
          },
        );
      });
    } finally {
      // Cleanup the generated Dockerfile + tarball.
      try { await rm(join(sourceDir, 'Dockerfile.deplox')); } catch { /* ignore */ }
      try { await rm(tarPath); } catch { /* ignore */ }
    }

    return { imageTag, durationMs: Date.now() - start };
  }

  async run(opts: {
    deploymentId: string;
    imageTag: string;
    hostPort: number;
    envVars: ReadonlyArray<{ key: string; value: string }>;
    framework: Framework;
    onLog?: (chunk: LogChunk) => void;
  }): Promise<RunResult> {
    const { imageTag, hostPort, envVars, framework, onLog } = opts;

    const containerPort = defaultPortFor(framework);
    const Env = envVars.map((e) => `${e.key}=${e.value}`);

    const container = await docker.createContainer({
      Image: imageTag,
      Env,
      ExposedPorts: { [`${containerPort}/tcp`]: {} },
      HostConfig: {
        PortBindings: {
          [`${containerPort}/tcp`]: [{ HostPort: String(hostPort) }],
        },
        // Capping resource limits per SECURITY_ARCHITECTURE Plane 3.
        Memory: parseMemoryString(cfg.DEPLOX_RUNTIME_MEMORY),
        NanoCpus: cfg.DEPLOX_RUNTIME_CPU * 1e9,
        NetworkMode: 'deplox-runtime',
        // Run as non-root.
        User: 'nobody',
        // Keep containers around (don't auto-remove) so failures are debuggable
        // and so the orchestrator's `stop` call can pick them up by name.
        AutoRemove: false,
        // `always` so the container self-heals after a crash OR a `docker stop`.
        // Critical for self-healing: a user's deplox app must come back on its
        // own if Docker restarts, the host reboots, or the process dies. The
        // orchestrator explicitly removes containers on project delete, so
        // `always` won't leak stopped containers.
        RestartPolicy: { Name: 'always' },
        ReadonlyRootfs: false,
      },
      name: `deplox-${opts.deploymentId}`,
    });

    await container.start();

    // Attach a log stream.
    container.logs(
      { stdout: true, stderr: true, follow: true },
      (err: Error | null, stream: NodeJS.ReadableStream | null) => {
        if (err || !stream) return;
        // Some apps write NUL bytes to stdout (e.g. ASCII art padding, or a
        // buggy `process.stdout.write(buf)`). `Buffer.toString('utf8')` is
        // strict in modern Node and throws on those — we'd lose the rest of
        // the log line. Use a stripping decoder via `setEncoding` so invalid
        // bytes become U+FFFD, and the log-streamer also sanitises NULs.
        stream.setEncoding('utf8');
        stream.on('data', (text: string) => {
          onLog?.({ stream: 'stdout', text: redactString(text) });
        });
        stream.on('error', () => {
          /* swallow */
        });
      },
    );

    return { containerId: container.id, hostPort };
  }

  async stop(opts: { containerId: string }): Promise<void> {
    try {
      const container = docker.getContainer(opts.containerId);
      await container.stop({ t: 5 });
    } catch (err) {
      // Best-effort. The container may already be gone.
      // eslint-disable-next-line no-console
    }
    try {
      const container = docker.getContainer(opts.containerId);
      await container.remove({ force: true });
    } catch {
      /* ignore */
    }
  }

  async logs(opts: { containerId: string; tail?: number }): Promise<string> {
    const container = docker.getContainer(opts.containerId);
    // `container.logs` without `follow: true` returns a fully-buffered
    // Buffer in current Dockerode — calling `.on()` on it throws and used
    // to crash the API. Handle both shapes (Buffer OR legacy stream).
    return await new Promise<string>((resolve, reject) => {
      container.logs(
        { stdout: true, stderr: true, tail: opts.tail ?? 100 },
        (err: Error | null, data: unknown) => {
          if (err) return reject(err);
          if (!data) return resolve('');
          if (Buffer.isBuffer(data)) {
            return resolve(data.toString('utf8'));
          }
          if (typeof (data as { on?: unknown }).on === 'function') {
            const stream = data as NodeJS.ReadableStream;
            const chunks: Buffer[] = [];
            stream.on('data', (c: Buffer) => chunks.push(c));
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            stream.on('error', (e: Error) => reject(e));
            return;
          }
          resolve(String(data));
        },
      );
    });
  }

  /**
   * Lists host ports currently published by any container whose name starts
   * with `deplox-` (our own runtime containers) AND that is running. Port
   * bindings are read straight from the Docker API, so this is the ground
   * truth even if the in-memory port-allocator cache is stale (e.g. after
   * an API restart, or when containers were started by a previous API
   * process and outlived it).
   */
  async listAllocatedPorts(): Promise<number[]> {
    const out = new Set<number>();
    try {
      // `listContainers` is a runtime method on the Dockerode prototype; the
      // bundled types don't expose it, so we cast through `unknown`.
      const containers = await (docker as unknown as {
        listContainers: (opts: { all?: boolean; filters?: { name?: string[] } }) => Promise<Array<{ Ports?: Array<{ PublicPort?: number }> }>>;
      }).listContainers({
        all: false,
        filters: { name: ['deplox-'] },
      });
      for (const c of containers) {
        for (const p of c.Ports ?? []) {
          if (p.PublicPort && p.PublicPort > 0) out.add(p.PublicPort);
        }
      }
    } catch {
      /* Docker unreachable — caller will fall back to DB. */
    }
    return Array.from(out);
  }
}