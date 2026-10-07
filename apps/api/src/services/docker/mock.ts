/**
 * In-memory mock of the Docker provider.
 *
 * Used when DEPLOX_MOCK_DOCKER=1 (default for first-time setup). Simulates
 *   - `build`  : 1.5s delay with realistic-looking build log lines
 *   - `run`    : tracks the container in a Map, returns a fake container ID
 *   - `stop`   : removes the container from the map
 *   - `logs`   : returns the captured log buffer
 *
 * No actual Docker is required. This lets you iterate on the orchestration
 * layer (auth, projects, deployments, env vars, SSE logs) on a machine
 * without Docker installed.
 */

import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type {
  BuildResult,
  DockerProvider,
  Framework,
  LogChunk,
  RunResult,
} from '@deplox/shared-types';
import { defaultPortFor } from '../framework-detector.js';

interface MockContainer {
  readonly id: string;
  readonly imageTag: string;
  readonly hostPort: number;
  readonly framework: Framework;
  readonly deploymentId: string;
  readonly logs: string[];
  readonly server: Server;
  running: boolean;
}

const containers = new Map<string, MockContainer>();
const containerTicks = new Map<string, NodeJS.Timeout>();

const FRAMEWORK_BUILD_OUTPUT: Record<Framework, string[]> = {
  react: [
    '> vite build',
    'vite v5 building for production...',
    '✓ 42 modules transformed.',
    'dist/index.html                 0.42 kB │ gzip:  0.28 kB',
    'dist/assets/index-abc123.js   142.18 kB │ gzip:  46.71 kB',
    '✓ built in 1.23s',
  ],
  nextjs: [
    '> next build',
    '   ▲ Next.js 14.2.5',
    '   - Local:        http://localhost:3000',
    '✓ Compiled successfully',
    '✓ Linting and checking validity of types',
    '✓ Collecting page data',
    '✓ Generating static pages (3/3)',
    '✓ Finalizing page optimization',
    'Route (app)                Size     First Load JS',
    '┌ ○ /                      1.2 kB         92 kB',
    '└ ○ /_not-found            0.4 kB         88 kB',
  ],
  node: [
    '> npm install',
    'added 142 packages in 4s',
    '> npm start',
    'Listening on port 3000',
  ],
  python: [
    'Collecting fastapi==0.111.0',
    'Collecting uvicorn==0.30.1',
    'Installing collected packages',
    'Successfully installed fastapi uvicorn',
    'INFO:     Started server process',
    'INFO:     Uvicorn running on http://0.0.0.0:8000',
  ],
  go: [
    'go: downloading dependencies',
    'go: build .',
    'Binary written to /out/app',
    'Starting /app on :8080',
  ],
  static: [
    'Serving /usr/share/nginx/html',
    'nginx/1.27.0',
    'Configuration loaded; ready to serve',
  ],
};

const RUNTIME_LOGS: Record<Framework, string[]> = {
  react: ['[nginx] GET / 200', '[nginx] GET /assets/index.js 200'],
  nextjs: ['[next] ready in 87ms', '[next] compiled client and server in 312 ms'],
  node: ['[node] listening on :3000', '[node] GET / 200 (4ms)'],
  python: ['[uvicorn] application startup complete', '[uvicorn] GET / 200'],
  go: ['[go] listening on :8080', '[go] GET / 200 (612µs)'],
  static: ['[nginx] worker process started', '[nginx] GET / 200'],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockDockerProvider implements DockerProvider {
  async build(opts: {
    deploymentId: string;
    sourceDir: string;
    framework: Framework;
    envVars?: ReadonlyArray<{ key: string; value: string }>;
    onLog?: (chunk: LogChunk) => void;
  }): Promise<BuildResult> {
    const start = Date.now();
    const { framework, onLog } = opts;
    const lines = FRAMEWORK_BUILD_OUTPUT[framework] ?? [];

    // Pretend to write the Dockerfile (so paths look real in logs).
    onLog?.({ stream: 'stdout', text: `Sending build context to Docker daemon (${(Math.random() * 4 + 1).toFixed(1)}MB)` });
    await sleep(200);

    for (const line of lines) {
      onLog?.({ stream: 'stdout', text: line });
      await sleep(150);
    }

    onLog?.({ stream: 'stdout', text: `Successfully tagged deplox/${opts.deploymentId}:latest` });
    await sleep(100);

    return { imageTag: `deplox/${opts.deploymentId}:latest`, durationMs: Date.now() - start };
  }

  async run(opts: {
    deploymentId: string;
    imageTag: string;
    hostPort: number;
    envVars: ReadonlyArray<{ key: string; value: string }>;
    framework: Framework;
    onLog?: (chunk: LogChunk) => void;
  }): Promise<RunResult> {
    const { framework, hostPort, onLog, deploymentId } = opts;
    const id = `mock-${randomUUID()}`;

    // Start a real HTTP server on the allocated port so the publicUrl actually
    // responds in mock mode. Without this, the URL is just a string with
    // nothing listening behind it.
    const server = createServer((req, res) => {
      const envKeys = opts.envVars.map((e) => e.key).join(', ') || '(none)';
      const body = `<!doctype html>
<html><head><title>DEPLOX mock · ${framework}</title>
<style>
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, ui-monospace, monospace;
         padding: 40px; max-width: 720px; margin: 0 auto; color: #111; }
  h1 { margin: 0 0 8px; font-size: 24px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 16px 0; }
  dt { color: #666; }
  code { background: #f3f3f3; padding: 2px 6px; border-radius: 3px; }
  .pill { display: inline-block; padding: 2px 8px; background: #111; color: #fff;
          border-radius: 3px; font-size: 11px; text-transform: uppercase; }
</style></head>
<body>
  <h1>DEPLOX mock container</h1>
  <p><span class="pill">${framework}</span> running on port ${hostPort}</p>
  <dl>
    <dt>Deployment</dt><dd><code>${deploymentId}</code></dd>
    <dt>Container ID</dt><dd><code>${id}</code></dd>
    <dt>Image tag</dt><dd><code>${opts.imageTag}</code></dd>
    <dt>Env vars injected</dt><dd>${envKeys}</dd>
    <dt>Request</dt><dd>${req.method} ${req.url}</dd>
    <dt>Time</dt><dd>${new Date().toISOString()}</dd>
  </dl>
  <p>This is a <strong>mock</strong> container. Real Docker is not running.
     Set <code>DEPLOX_MOCK_DOCKER=0</code> + install Docker Desktop + WSL 2
     to deploy actual containers.</p>
</body></html>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
      const line = `[mock] ${new Date().toISOString()} ${req.method} ${req.url} 200`;
      onLog?.({ stream: 'stdout', text: line });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(hostPort, '0.0.0.0', () => resolve());
    });

    const container: MockContainer = {
      id,
      imageTag: opts.imageTag,
      hostPort,
      framework,
      deploymentId,
      logs: [],
      server,
      running: true,
    };
    containers.set(container.id, container);

    // Emit a few startup lines.
    for (const line of RUNTIME_LOGS[framework]) {
      container.logs.push(line);
      onLog?.({ stream: 'stdout', text: line });
      await sleep(120);
    }

    // Schedule a periodic "request" log line so SSE streams have content.
    const tick = setInterval(() => {
      if (!container.running) {
        clearInterval(tick);
        containerTicks.delete(id);
        return;
      }
      const line = `[mock] ${new Date().toISOString()} GET / 200 (${Math.round(Math.random() * 10)}ms)`;
      container.logs.push(line);
      onLog?.({ stream: 'stdout', text: line });
    }, 5000);
    containerTicks.set(id, tick);

    return { containerId: id, hostPort };
  }

  async stop(opts: { containerId: string }): Promise<void> {
    const c = containers.get(opts.containerId);
    if (c) {
      c.running = false;
      c.server.close();
      const tick = containerTicks.get(opts.containerId);
      if (tick) {
        clearInterval(tick);
        containerTicks.delete(opts.containerId);
      }
      containers.delete(opts.containerId);
    }
  }

  async logs(opts: { containerId: string; tail?: number }): Promise<string> {
    const c = containers.get(opts.containerId);
    if (!c) return '';
    const tail = opts.tail ?? c.logs.length;
    return c.logs.slice(-tail).join('\n');
  }

  async listAllocatedPorts(): Promise<number[]> {
    return Array.from(containers.values())
      .filter((c) => c.running)
      .map((c) => c.hostPort);
  }
}

/** Helper for tests / debug endpoints. */
export function _listMockContainers(): MockContainer[] {
  return Array.from(containers.values());
}

/** Convert port allocation to a default port per framework — used by real provider too. */
export { defaultPortFor };