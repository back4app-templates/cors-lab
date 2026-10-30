// File: relay/relay.mjs · the local helper server of the R9′ (Local Network Access) fixture, modeled on
// the dev relay hit on 2026-10-29 (cashflow-tracker/scripts/serve-cloud.mjs): binds 127.0.0.1 only,
// answers GET with Access-Control-Allow-Origin: * and does NOT special-case OPTIONS. Every request is
// logged with an id so the LNA captures can state whether the browser sent anything at all per
// permission state — under a denied LNA permission the absence of a log line is the evidence.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export function createRelay() {
  let n = 0;
  return createServer((req, res) => {
    const id = `relay-${String(++n).padStart(4, '0')}`;
    console.log(`[relay] ${id} ${req.method} ${req.url} origin=${req.headers.origin ?? '-'}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') { res.statusCode = 404; return res.end('not found'); } // no OPTIONS handling — deliberate
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ route: 'relay', reqId: id, url: req.url }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 1347;
  createRelay().listen(port, '127.0.0.1', () =>
    console.log(`[relay] local relay on http://127.0.0.1:${port}/ (LNA fixture target)`));
}
