// R4 cookie rows (amendment B2): attribute cells, the simple-credentialed vs preflighted-credentialed
// split, the correct credentialed pair, and the flag-gated reflect-origin anti-pattern.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api/app.mjs';
import { listen, raw, serverLog, summarizeLog, summarizeWire, record, cid, PAGE_ORIGIN } from './helpers.mjs';

let api;
test.before(async () => { api = await listen(createApi({}).app); });
test.after(async () => { await api.close(); });

test('R4 cookie cells: /r4/set-cookie emits exactly the attributes of the named cell', async () => {
  const cells = [
    ['samesite=unset', 'lab_unset=1; Path=/; Max-Age=3600'],
    ['samesite=Lax', 'lab_lax=1; Path=/; Max-Age=3600; SameSite=Lax'],
    ['samesite=Strict', 'lab_strict=1; Path=/; Max-Age=3600; SameSite=Strict'],
    ['samesite=None&secure=1', 'lab_none_secure=1; Path=/; Max-Age=3600; SameSite=None; Secure'],
    ['samesite=None', 'lab_none=1; Path=/; Max-Age=3600; SameSite=None'],
  ];
  const got = [];
  for (const [qs, expected] of cells) {
    const res = await raw(api.origin, `/r4/set-cookie?${qs}`, { headers: { Origin: PAGE_ORIGIN } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.headers['set-cookie'], [expected]);
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
    assert.equal(res.headers['access-control-allow-origin'], PAGE_ORIGIN);
    got.push(expected);
  }
  record({ row: 'R4-cookie-cells', route: 'GET /r4/set-cookie', request: '5 attribute cells requested (comparison requests; whether a BROWSER stores/sends each cookie is a per-cell capture)', wire: got.join(' · '), serverLog: 'executed ×5; Set-Cookie lines above are what each cell puts on the wire' });
});

test('R4a: simple credentialed GET — wildcard + no allow-credentials on the wire; the server EXECUTES and sees the cookie', async () => {
  const c = cid('r4a');
  const res = await raw(api.origin, `/r4a/wildcard-credentials?cid=${c}`, { headers: { Origin: PAGE_ORIGIN, Cookie: 'lab_unset=1' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.equal(res.headers['access-control-allow-credentials'], undefined);
  assert.equal(JSON.parse(res.body).cookieArrived, true);
  const log = await serverLog(api.origin, c);
  assert.equal(log.length, 1);
  assert.equal(log[0].phase, 'main');
  assert.equal(log[0].handlerExecuted, true);
  assert.deepEqual(log[0].cookieNames, ['lab_unset']);
  record({ row: 'R4a', route: 'GET /r4a/wildcard-credentials', request: `simple GET with Origin + Cookie: lab_unset=1 (comparison request)`, wire: summarizeWire(res), serverLog: `${summarizeLog(log)}; cookieNames=[lab_unset] — RAN with the cookie; a credentialed browser call is only blocked from READING ('*' with credentials). Whether the browser sends the cookie at all: per-cell capture` });
});

test('R4b: the preflight for the credentialed-preflighted row carries the wildcard — blocked BEFORE the main request', async () => {
  const c = cid('r4b');
  const pre = await raw(api.origin, `/r4b/wildcard-credentials-preflight?cid=${c}`, {
    method: 'OPTIONS',
    headers: { Origin: PAGE_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], '*');
  assert.equal(pre.headers['access-control-allow-credentials'], undefined);
  const log = await serverLog(api.origin, c);
  assert.equal(log.length, 1, 'only the preflight reached the server in this exchange');
  assert.equal(log[0].phase, 'preflight');
  record({ row: 'R4b', route: 'OPTIONS /r4b/wildcard-credentials-preflight', request: 'preflight for a credentialed JSON POST (comparison request)', wire: summarizeWire(pre), serverLog: `${summarizeLog(log)} — for a credentialed caller the browser stops at this answer; the main handler never runs (distinct row from R4a by design)` });
});

test('R4 fix: exact origin + Access-Control-Allow-Credentials: true on both preflight and main', async () => {
  const c = cid('r4fix');
  const pre = await raw(api.origin, `/r4/fix?cid=${c}`, { method: 'OPTIONS', headers: { Origin: PAGE_ORIGIN, 'Access-Control-Request-Method': 'GET' } });
  assert.equal(pre.headers['access-control-allow-origin'], PAGE_ORIGIN);
  assert.equal(pre.headers['access-control-allow-credentials'], 'true');
  const res = await raw(api.origin, `/r4/fix?cid=${c}`, { headers: { Origin: PAGE_ORIGIN, Cookie: 'lab_lax=1' } });
  assert.equal(res.headers['access-control-allow-origin'], PAGE_ORIGIN);
  assert.equal(res.headers['access-control-allow-credentials'], 'true');
  assert.equal(JSON.parse(res.body).cookieArrived, true);
  record({ row: 'R4-fix', route: 'GET /r4/fix', request: 'credentialed pair done right (comparison requests)', wire: `preflight ${summarizeWire(pre)}; main ${summarizeWire(res)}`, serverLog: 'executed; cookie seen by the handler' });
});

test('anti-pattern gate: /unsafe/reflect-origin is NOT registered by default', async () => {
  const res = await raw(api.origin, '/unsafe/reflect-origin', { headers: { Origin: 'http://evil.example' } });
  assert.equal(res.status, 404);
  record({ row: 'CC-reflect-origin-OFF', route: 'GET /unsafe/reflect-origin', request: 'GET with a foreign Origin, default server (comparison request)', wire: summarizeWire(res), serverLog: 'route not registered — ships off by default (amendment-9 pattern)' });
});

test('anti-pattern with UNSAFE_REFLECT_ORIGIN=1: ANY origin is reflected with credentials allowed', async () => {
  const unsafe = await listen(createApi({ unsafeReflectOrigin: true }).app);
  const res = await raw(unsafe.origin, '/unsafe/reflect-origin', { headers: { Origin: 'http://evil.example', Cookie: 'lab_unset=1' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], 'http://evil.example');
  assert.equal(res.headers['access-control-allow-credentials'], 'true');
  assert.equal(JSON.parse(res.body).cookieArrived, true);
  await unsafe.close();
  record({ row: 'CC-reflect-origin-ON', route: 'GET /unsafe/reflect-origin (flag on)', request: 'GET with Origin: http://evil.example + a cookie (comparison request)', wire: summarizeWire(res), serverLog: 'executed — the allowlist is OFF while looking configured; shown once, labeled the thing not to ship' });
});
