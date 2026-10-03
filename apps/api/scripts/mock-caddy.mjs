#!/usr/bin/env node
/**
 * Minimal mock Caddy admin server for E2E testing the caddy.ts client.
 *
 * Implements:
 *   GET    /config/             -> { apps: { http: { servers: { srv0: { routes: [] } } } } }
 *   POST   /id/<id>             -> stores route under <id>; returns 200
 *   GET    /id/<id>             -> returns stored route or 404
 *   DELETE /id/<id>             -> removes route; returns 200
 *   GET    /_deplox_routes      -> returns all stored routes
 *
 * Run: node apps/api/scripts/mock-caddy.mjs [port]
 * Default port: 2019 (matches DEPLOX_CADDY_ADMIN_URL default).
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 2019);
const routes = new Map();

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  // Read body
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const bodyText = Buffer.concat(chunks).toString('utf8');

  if (req.method === 'GET' && url.pathname === '/config/') {
    return send(res, 200, {
      apps: { http: { servers: { srv0: { routes: Array.from(routes.values()) } } } },
    });
  }

  if (url.pathname === '/_deplox_routes') {
    return send(res, 200, Object.fromEntries(routes));
  }

  const idMatch = /^\/id\/(.+)$/.exec(url.pathname);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1]);
    if (req.method === 'POST') {
      try {
        const obj = JSON.parse(bodyText || '{}');
        obj['@id'] = id;
        routes.set(id, obj);
        console.log(`[mock-caddy] registered route ${id}:`, obj);
        return send(res, 200, '');
      } catch (err) {
        return send(res, 400, { error: String(err) });
      }
    }
    if (req.method === 'GET') {
      const r = routes.get(id);
      return r ? send(res, 200, r) : send(res, 404, '');
    }
    if (req.method === 'DELETE') {
      const had = routes.delete(id);
      console.log(`[mock-caddy] ${had ? 'removed' : 'no-op (not present)'} route ${id}`);
      return send(res, had ? 200 : 404, '');
    }
  }

  return send(res, 404, { error: 'unknown_path', path: url.pathname });
});

server.listen(port, () => {
  console.log(`[mock-caddy] listening on http://localhost:${port}`);
});