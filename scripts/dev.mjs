// File: scripts/dev.mjs · starts the whole local lab: API 1345 · page 1346 + dev 5173 (+ https 1349 if
// page/cert exists) · relay 127.0.0.1:1347 · shared-cache proxy 1348. Ctrl-C stops everything.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pieces = [
  ['api', 'api/server.mjs'],
  ['page', 'page/server.mjs'],
  ['relay', 'relay/relay.mjs'],
  ['cache', 'cache/proxy.mjs'],
];

const children = pieces.map(([name, file]) => {
  const child = spawn(process.execPath, [path.join(root, file)], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
  child.on('exit', (code) => console.log(`[dev] ${name} exited (${code})`));
  return child;
});

function stop() { for (const c of children) c.kill('SIGTERM'); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

console.log('[dev] lab map: page A http://localhost:1346 · page B (dev) http://localhost:5173 · API http://localhost:1345 (cross-site: http://127.0.0.1:1345) · relay http://127.0.0.1:1347 · cache proxy http://localhost:1348 · https page https://localhost:1349 (after npm run cert)');
