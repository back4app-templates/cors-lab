// R6 (redirects), R7 (the misleading 500-behind-a-CORS-message), R12 (duplicate allow-origin).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api/app.mjs';
import { listen, raw, serverLog, summarizeLog, summarizeWire, record, cid, PAGE_ORIGIN } from './helpers.mjs';

let api;
test.before(async () => { api = await listen(createApi({}).app); });
test.after(async () => { await api.close(); });

test('R6a: the preflight is answered with a 301 — no browser gets past this', async () => {
  const c = cid('r6a');
  const pre = await raw(api.origin, `/r6a/redirect-on-preflight?cid=${c}`, {
    method: 'OPTIONS',
    headers: { Origin: PAGE_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(pre.status, 301);
  assert.equal(pre.headers.location, '/ok');
  const log = await serverLog(api.origin, c);
  assert.equal(log.length, 1);
  assert.equal(log[0].phase, 'preflight');
  record({ row: 'R6a', route: 'OPTIONS /r6a/redirect-on-preflight', request: 'preflight for a JSON POST (comparison request)', wire: summarizeWire(pre), serverLog: `${summarizeLog(log)} — a preflight must not be answered with a redirect; the main POST handler is correct and never reached by a browser` });
});

test('R6b: the 301 itself carries CORS headers; the TARGET answers 200 with none — the one failing factor', async () => {
  const c = cid('r6b');
  const redir = await raw(api.origin, `/r6b/redirect-main?cid=${c}`, { headers: { Origin: PAGE_ORIGIN } });
  assert.equal(redir.status, 301);
  assert.equal(redir.headers['access-control-allow-origin'], PAGE_ORIGIN);
  assert.match(redir.headers.location, /^\/r6b\/target/);
  const target = await raw(api.origin, redir.headers.location, { headers: { Origin: PAGE_ORIGIN } });
  assert.equal(target.status, 200);
  assert.equal(target.headers['access-control-allow-origin'], undefined);
  const log = await serverLog(api.origin, c);
  assert.equal(log.length, 2);
  assert.ok(log.every((e) => e.handlerExecuted));
  record({ row: 'R6b', route: 'GET /r6b/redirect-main → /r6b/target', request: `simple GET with Origin: ${PAGE_ORIGIN}, redirect followed by hand (comparison requests)`, wire: `redirect: ${summarizeWire(redir)}; target: ${summarizeWire(target)}`, serverLog: `${summarizeLog(log)} — both hops RAN; the target's missing header is what a browser rejects` });
});

test('R7 control: the happy path answers 200 with correct CORS headers', async () => {
  const c = cid('r7ok');
  const res = await raw(api.origin, `/r7/throws?cid=${c}`, { headers: { Origin: PAGE_ORIGIN } });
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], PAGE_ORIGIN);
  record({ row: 'R7-ok', route: 'GET /r7/throws', request: 'happy path (comparison request)', wire: summarizeWire(res), serverLog: 'executed' });
});

test('R7 boom: the handler RUNS, throws, and the 500 carries no CORS headers — the misleading case (H2)', async () => {
  const c = cid('r7boom');
  const before = JSON.parse((await raw(api.origin, '/__state')).body).counters['r7-ran'] ?? 0;
  const res = await raw(api.origin, `/r7/throws?cid=${c}&boom=1`, { headers: { Origin: PAGE_ORIGIN } });
  assert.equal(res.status, 500);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  const after = JSON.parse((await raw(api.origin, '/__state')).body).counters['r7-ran'];
  assert.equal(after, before + 1, 'the route executed — the console-side "CORS error" hides a plain 500');
  const log = await serverLog(api.origin, c);
  assert.equal(log[0].handlerExecuted, true);
  assert.equal(log[0].status, 500);
  record({ row: 'R7-boom', route: 'GET /r7/throws?boom=1', request: `simple GET with Origin: ${PAGE_ORIGIN} (comparison request)`, wire: summarizeWire(res), serverLog: `${summarizeLog(log)}; counter r7-ran ${before}→${after} — RAN and crashed; the real bug is the 500, not a policy. Non-idempotent calls DID execute` });
});

test('R12: Access-Control-Allow-Origin appears TWICE on the wire (two raw header lines)', async () => {
  const c = cid('r12');
  const res = await raw(api.origin, `/r12/duplicate-allow-origin?cid=${c}`, { headers: { Origin: PAGE_ORIGIN } });
  assert.equal(res.status, 200);
  const lines = [];
  for (let i = 0; i < res.rawHeaders.length; i += 2) {
    if (res.rawHeaders[i].toLowerCase() === 'access-control-allow-origin') lines.push(res.rawHeaders[i + 1]);
  }
  assert.equal(lines.length, 2, 'exactly two allow-origin header lines on the wire');
  assert.deepEqual(lines, [PAGE_ORIGIN, PAGE_ORIGIN]);
  record({ row: 'R12', route: 'GET /r12/duplicate-allow-origin', request: `simple GET with Origin: ${PAGE_ORIGIN} (comparison request; raw header lines inspected)`, wire: `${res.status} · access-control-allow-origin line 1: ${lines[0]} · line 2: ${lines[1]}`, serverLog: 'executed — middleware plus a hand-set header; a browser requires exactly one value' });
});
