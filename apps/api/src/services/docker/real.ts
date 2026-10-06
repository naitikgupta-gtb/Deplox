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

const docker = new Dockerode();
const cfg = loadConfig();

const BUILD_IMAGE = 'deplox/build-runner:latest'; // pre-baked in infra/docker/build.Dockerfile

/** Writes a tiny per-framework Dockerfile into the source dir, returns its path. */
async function generateDockerfile(
  framework: Framework,
  sourceDir: string,
): Promise<string> {
  const tmpl = await loadTemplate(framework);
  const target = join(sourceDir, 'Dockerfile.deplox');
  await writeFile(target, tmpl, 'utf8');
  return target;
}

async function loadTemplate(framework: Framework): Promise<string> {
  // In a real install we read from a known absolute path; here we inline a
  // minimal generator that produces correct output for the most common case.
  switch (framework) {
    case 'react':
      return `FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
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
      // Ember, Express, Fastify, Koa, etc. We try the package's `start`
      // script first (most projects define one), then fall through to common
      // entry points. We do NOT inject `--host 0.0.0.0` — apps that ignore
      // unknown flags are lucky, and those that don't (strict Express 5)
      // will crash with EADDRINUSE or argv errors.
      return [
        'FROM node:20-alpine',
        'WORKDIR /app',
        'COPY package*.json ./',
        'RUN npm install --omit=dev || true',
        'COPY . .',
        'EXPOSE 3000',
        'USER node',
        'CMD ["sh", "-c", "npm start || node server.js || node index.js || node src/index.js || node src/server.js || node app.js || (echo no-entry-point-found && exit 1)"]',
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
    onLog?: (chunk: LogChunk) => void;
  }): Promise<BuildResult> {
    const start = Date.now();
    const { deploymentId, sourceDir, framework, onLog } = opts;

    await generateDockerfile(framework, sourceDir);
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

      const buildStream = await docker.buildImage(tarPath, {
        dockerfile: 'Dockerfile.deplox',
        t: imageTag,
        // `src` is required when we pass a file path so Dockerode reads it as a
        // tarball instead of trying to repack a directory.
        src: ['.'],
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
        RestartPolicy: { Name: 'no' },
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
    return await new Promise<string>((resolve, reject) => {
      container.logs(
        { stdout: true, stderr: true, tail: opts.tail ?? 100 },
        (err: Error | null, stream: NodeJS.ReadableStream | null) => {
          if (err) return reject(err);
          if (!stream) return resolve('');
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          stream.on('error', (e: Error) => reject(e));
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