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
    proxy: {
      // Proxy /api and /auth to the Fastify backend so cookies share origin.
      '/api': { target: API_PROXY, changeOrigin: true },
      '/auth': { target: API_PROXY, changeOrigin: true },
      '/health': { target: API_PROXY, changeOrigin: true },
    },
  },
});