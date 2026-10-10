// Test Caddy's save endpoints
const http = require('http');

function get(path) {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:2019${path}`, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
  });
}

function post(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1', port: 2019, path, method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
      },
      (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => resolve({ status: res.statusCode, body: b }));
      },
    );
    req.write(data);
    req.end();
  });
}

(async () => {
  // Get the current full config
  const cur = await get('/config/');
  console.log('current full config size:', cur.body.length, 'bytes');

  // Try various save approaches
  console.log('--- POST /load/ (replace active) ---');
  const r1 = await post('/load/', JSON.parse(cur.body));
  console.log('  status:', r1.status, r1.body.slice(0, 100));

  console.log('--- POST /config/?pretty (save active to storage) ---');
  const r2 = await post('/config/?pretty', {});
  console.log('  status:', r2.status, r2.body.slice(0, 100));
})();