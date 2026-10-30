// R2 (no CORS handling, simple vs preflighted), R3a/b/c (wrong allowlist values), R5 (allow-headers),
// R8 (origin not in the allowlist). Wire + server-log evidence; browser outcomes are captures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api/app.mjs';
import { listen, raw, serverLog, summarizeLog, summarizeWire, record, cid, PAGE_ORIGIN, DEV_ORIGIN } from './helpers.mjs';

let api;
test.before(async () => { api = await listen(createApi({}).app); });
test.after(async () => { await api.close(); });

test('R2 simple POST: the handler EXECUTES and answers 200 — with no allow-origin header on the wire', async () => {
  const c = cid('r2s');
  const before = JSON.parse((await raw(api.origin, '/__state')).body).counters.r2 ?? 0;
  const res = await raw(api.origin, `/r2/no-cors?cid=${c}`, { method: 'POST', headers: { Origin: PAGE_ORIGIN, 'Content-Type': 'text/plain' }, body: 'r2 simple post' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  const after = JSON.parse((await raw(api.origin, '/__state')).body).counters.r2;
  assert.equal(after, before + 1, 'the route counter moved: the server ran it');
  const log = await serverLog(api.origin, c);
  assert.equal(log.length, 1);
  assert.equal(log[0].phase, 'main');
  assert.equal(log[0].handlerExecuted, true);
  record({ row: 'R2-simple-POST', route: 'POST /r2/no-cors (text/plain)', request: `simple POST with Origin: ${PAGE_ORIGIN} (comparison request)`, wire: summarizeWire(res), serverLog: `${summarizeLog(log)}; counter r2 ${before}→${after} — RAN; a browser would only refuse to expose the response` });
});

test('R2 preflight: OPTIONS is answered by Express itself, with NO CORS headers and NO route code running', async () => {
  const c = cid('r2p');
  const pre = await raw(api.origin, `/r2/no-cors?cid=${c}`, {
    method: 'OPTIONS',
    headers: { Origin: PAGE_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  // Not assumed 404: Express answers OPTIONS for routes that exist. Captured as observed:
  assert.equal(res200orRecord(pre.status), true);
  assert.equal(pre.headers['access-control-allow-origin'], undefined);
  const log = await serverLog(api.origin, c);
  assert.equal(log.length, 1);
  assert.equal(log[0].phase, 'preflight');
  assert.equal(log[0].handlerExecuted, false, 'no route code ran — Express default OPTIONS');
  record({ row: 'R2-preflight', route: 'OPTIONS /r2/no-cors', request: 'preflight OPTIONS (comparison request)', wire: summarizeWire(pre), serverLog: `${summarizeLog(log)} — a browser preflight fails here, so the MAIN request is never sent (distinct from R2-simple)` });
});
function res200orRecord(status) { return [200, 204, 404].includes(status); }

for (const [row, route, factor] of [
  ['R3a', '/r3a/wrong-scheme', 'scheme flipped'],
  ['R3b', '/r3b/wrong-port', 'wrong port'],
  ['R3c', '/r3c/trailing-slash', 'trailing slash'],
]) {
  test(`${row}: 200 on the wire, allow-origin present but NOT equal to the page origin (${factor})`, async () => {
    const c = cid(row);
    const res = await raw(api.origin, `${route}?cid=${c}`, { headers: { Origin: PAGE_ORIGIN } });
    assert.equal(res.status, 200);
    const acao = res.headers['access-control-allow-origin'];
    assert.ok(acao, 'a header IS there — the value is the one wrong factor');
    assert.notEqual(acao, PAGE_ORIGIN);
    const body = JSON.parse(res.body);
    assert.equal(body.allowOriginSent, acao);
    const log = await serverLog(api.origin, c);
    assert.equal(log[0].handlerExecuted, true);
    record({ row, route: `GET ${route}`, request: `simple GET with Origin: ${PAGE_ORIGIN} (comparison request)`, wire: summarizeWire(res), serverLog: `${summarizeLog(log)} — RAN; the browser compares '${acao}' with '${PAGE_ORIGIN}' and refuses to expose the 200` });
  });
}

test('R5: the preflight succeeds as HTTP (204) and omits X-Client-Version from allow-headers', async () => {
  const c = cid('r5');
  const pre = await raw(api.origin, `/r5/missing-allow-header?cid=${c}`, {
    method: 'OPTIONS',
    headers: { Origin: PAGE_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-client-version' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], PAGE_ORIGIN);
  assert.doesNotMatch(pre.headers['access-control-allow-headers'], /x-client-version/i);
  const okPre = await raw(api.origin, `/ok?cid=${c}-fix`, {
    method: 'OPTIONS',
    headers: { Origin: PAGE_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-client-version' },
  });
  assert.match(okPre.headers['access-control-allow-headers'], /x-client-version/i);
  const log = await serverLog(api.origin, c);
  record({ row: 'R5', route: 'OPTIONS /r5/missing-allow-header', request: 'preflight asking for x-client-version (comparison request)', wire: `broken: ${summarizeWire(pre)}; fix (/ok): allow-headers: ${okPre.headers['access-control-allow-headers']}`, serverLog: `${summarizeLog(log)} — preflight 204 as HTTP yet fails as CORS; main request never sent by a browser` });
});

test('R8: /ok answers the dev origin with NO allow-origin header (allowlist names only the page origins)', async () => {
  const c = cid('r8');
  const res = await raw(api.origin, `/ok?cid=${c}`, { headers: { Origin: DEV_ORIGIN } });
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  const fixed = await listen(createApi({ allowedOrigins: [PAGE_ORIGIN, DEV_ORIGIN] }).app);
  const res2 = await raw(fixed.origin, '/ok', { headers: { Origin: DEV_ORIGIN } });
  assert.equal(res2.headers['access-control-allow-origin'], DEV_ORIGIN);
  await fixed.close();
  const log = await serverLog(api.origin, c);
  assert.equal(log[0].handlerExecuted, true);
  record({ row: 'R8', route: 'GET /ok (Origin: dev)', request: `simple GET with Origin: ${DEV_ORIGIN} (comparison request)`, wire: `default allowlist: ${summarizeWire(res)}; with dev origin added to ALLOWED_ORIGINS: ${summarizeWire(res2)}`, serverLog: `${summarizeLog(log)} — RAN; fix is the explicit extra origin, not '*'` });
});
