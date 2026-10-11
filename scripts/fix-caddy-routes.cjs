// One-shot script to re-prime Caddy routes for the 4 known deplox deployments.
// Used to recover from a duplicate-route shadowing bug in apps/api/src/services/caddy.ts
// (the priming loop only deleted the FIRST route with a given @id, so previous
// buggy runs left orphans in the array that shadowed later routes).
//
// Run with: node scripts/fix-caddy-routes.cjs

const http = require('node:http');

const CADDY_ADMIN = 'http://localhost:2019';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      `${CADDY_ADMIN}${path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const ROUTES = [
  { id: 'deplox-auto-4654d0fb-20b1-4d13-8795-4057363694c5', host: 'event-checkin-ec.deplox.site',         upstream: 'host.docker.internal:9002' },
  { id: 'deplox-auto-771740d7-75f3-4cd2-a832-281e7d76fbc4', host: 'glbitm-attendance-system-gas.deplox.site', upstream: 'host.docker.internal:9003' },
  { id: 'deplox-auto-c6d98ce7-2013-404a-b942-6d4e5e798965', host: 'velvetbrew-coffee-vc.deplox.site',   upstream: 'host.docker.internal:9004' },
  { id: 'deplox-auto-b2cc84f5-8728-4672-a2a9-c7baefe09743', host: 'ember-coffee-ec.deplox.site',        upstream: 'host.docker.internal:9005' },
];

(async () => {
  // 1) Get current routes
  const cur = await req('GET', '/config/apps/http/servers/srv0/routes/');
  const routes = JSON.parse(cur.body);
  console.log(`current routes: ${routes.length}`);

  // 2) Delete every deplox- route (by index, reverse order so indexes stay stable)
  const deploxIdxs = [];
  routes.forEach((r, i) => {
    if (typeof r['@id'] === 'string' && r['@id'].startsWith('deplox-')) {
      deploxIdxs.push(i);
    }
  });
  for (const i of deploxIdxs.reverse()) {
    const res = await req('DELETE', `/config/apps/http/servers/srv0/routes/${i}`);
    console.log(`  delete[${i}] -> ${res.status}`);
  }

  // 3) Re-add each deplox route (POST appends at the end)
  for (const r of ROUTES) {
    const body = {
      '@id': r.id,
      handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: r.upstream }] }],
      match: [{ host: [r.host] }],
      terminal: true,
    };
    const res = await req('POST', '/config/apps/http/servers/srv0/routes/', body);
    console.log(`  POST ${r.host} -> ${res.status}`);
  }

  // 4) Move the bare catch-all (no @id) to the end so subdomain routes match first
  const after = await req('GET', '/config/apps/http/servers/srv0/routes/');
  const afterRoutes = JSON.parse(after.body);
  const catchAllIdx = afterRoutes.findIndex((r) => r['@id'] === undefined);
  if (catchAllIdx >= 0 && catchAllIdx !== afterRoutes.length - 1) {
    const caught = afterRoutes[catchAllIdx];
    const del = await req('DELETE', `/config/apps/http/servers/srv0/routes/${catchAllIdx}`);
    console.log(`  delete catch-all[${catchAllIdx}] -> ${del.status}`);
    const post = await req('POST', '/config/apps/http/servers/srv0/routes/', caught);
    console.log(`  re-append catch-all -> ${post.status}`);
  }

  // 5) Final state
  const final = await req('GET', '/config/apps/http/servers/srv0/routes/');
  const finalRoutes = JSON.parse(final.body);
  console.log(`\nfinal routes: ${finalRoutes.length}`);
  for (const r of finalRoutes) {
    const id = r['@id'] || '(catch-all)';
    const host = r.match?.[0]?.host?.[0] || '*';
    const dial = r.handle?.[0]?.upstreams?.[0]?.dial || '?';
    console.log(`  [${host}] -> ${dial}  (${id})`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});