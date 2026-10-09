// Quick status snapshot: what's listening, what node processes are running
const http = require('http');
const { execSync } = require('child_process');

const portList = (() => {
  try {
    return execSync('powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 5173, 8080, 8000, 2019, 9002, 9003, 9004, 9005 } | Select-Object LocalAddress, LocalPort | Format-Table -AutoSize | Out-String"', { encoding: 'utf8' });
  } catch (e) {
    return '(err: ' + e.message + ')';
  }
})();

console.log('=== listening ports ===');
console.log(portList);

try {
  const procs = execSync('powershell -NoProfile -Command "Get-Process node, cloudflared, caddy -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize | Out-String"', { encoding: 'utf8' });
  console.log('=== processes ===');
  console.log(procs);
} catch (e) {
  console.log('proc err:', e.message);
}