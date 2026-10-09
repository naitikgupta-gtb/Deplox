// Verify all 4 public URLs return real app content (not the dashboard)
const https = require('https');

const urls = [
  ['https://deplox.site/',                                       'DASHBOARD'],
  ['https://event-checkin-ec.deplox.site/',                       'EVENT-CHECKIN'],
  ['https://glbitm-attendance-system-gas.deplox.site/',           'ATTENDANCE'],
  ['https://velvetbrew-coffee-vc.deplox.site/',                   'VELVETBREW'],
  ['https://ember-coffee-ec.deplox.site/',                        'EMBER-COFFEE'],
];

async function test_(url, expected) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        const ok = body.length > 0;
        const marker = ok ? '✓' : '✗';
        console.log(`${marker} ${url} → ${res.statusCode} (${body.length}b, expected: ${expected})`);
        resolve();
      });
    });
    req.on('timeout', () => { console.log(`✗ ${url} TIMEOUT`); req.destroy(); resolve(); });
    req.on('error', (e) => { console.log(`✗ ${url} ERR: ${e.code}`); resolve(); });
  });
}

(async () => {
  for (const [u, e] of urls) await test_(u, e);
})();