// File: test/helpers.mjs · in-process servers on ephemeral ports + a raw Node HTTP client.
// Everything sent from here is a COMPARISON REQUEST (amendment B3): it shows what the server answers to
// an equivalent request with no browser involved — never proof about a browser request. No CORS is
// enforced here by design; that is the demonstration.
import http from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rowsFile = path.join(root, 'docs', 'evidence', '.rows-local.jsonl');

export const PAGE_ORIGIN = 'http://localhost:1346';
export const DEV_ORIGIN = 'http://localhost:5173';

export function record(row) {
  mkdirSync(path.dirname(rowsFile), { recursive: true });
  appendFileSync(rowsFile, `${JSON.stringify(row)}\n`);
}

export function listen(serverOrApp) {
  const server = typeof serverOrApp === 'function' ? http.createServer(serverOrApp) : serverOrApp;
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

/** Raw HTTP request that never follows redirects and preserves duplicate header lines (rawHeaders). */
export function raw(origin, pathname, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${origin}${pathname}`, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        rawHeaders: res.rawHeaders,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

/** Read the API's own log for one cid — the logs-side column of every matrix row. */
export async function serverLog(apiOrigin, cid) {
  const res = await raw(apiOrigin, `/__state?cid=${encodeURIComponent(cid)}`);
  return JSON.parse(res.body).log;
}

export function summarizeLog(log) {
  if (!log.length) return 'nothing reached the server (no preflight, no main request)';
  return log.map((e) => `${e.phase} ${e.method} → ${e.status}, handler executed: ${e.handlerExecuted}`).join('; ');
}

export function summarizeWire(res, names = ['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-headers', 'access-control-max-age', 'vary', 'location', 'allow', 'set-cookie', 'x-lab-cache', 'x-lab-cached-from-origin']) {
  const parts = [`${res.status}`];
  for (const n of names) {
    const v = res.headers[n];
    if (v !== undefined) parts.push(`${n}: ${Array.isArray(v) ? v.join(' · ') : v}`);
  }
  return parts.join(' · ');
}

let cidN = 0;
export const cid = (tag) => `t-${tag}-${(++cidN).toString(36)}-${Date.now().toString(36)}`;
