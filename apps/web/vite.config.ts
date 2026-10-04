import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PROXY = process.env.DEPLOX_API_URL ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  // Vite defaults to looking for .env in cwd. Our .env lives at the monorepo
  // root, so point envDir at it (../../.env relative to apps/web).
  envDir: '../../',
  server: {
    port: 5173,
    // Listen on all interfaces and accept any Host header so the dev server
    // works behind a reverse proxy / Cloudflare Tunnel (where the public
    // Host differs from localhost). Without `allowedHosts: true` Vite 5+
    // rejects requests whose Host header isn't 'localhost' or '127.0.0.1'.
    host: '0.0.0.0',
    strictPort: false,
    allowedHosts: true,
    proxy: {
      // Proxy /api and /auth to the Fastify backend so cookies share origin.
      '/api': { target: API_PROXY, changeOrigin: true },
      '/auth': { target: API_PROXY, changeOrigin: true },
      '/health': { target: API_PROXY, changeOrigin: true },
      // GitHub webhooks — same origin so the X-Hub-Signature-256 payload
      // flows through verbatim without a cross-origin re-sign.
      '/webhooks': { target: API_PROXY, changeOrigin: true },
    },
  },
});