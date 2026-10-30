// R0 positive control first (house rule), the timing fixtures' headers, and the counter-case fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api/app.mjs';
import { createPage } from '../page/app.mjs';
import { listen, raw, serverLog, summarizeLog, summarizeWire, record, cid, PAGE_ORIGIN } from './helpers.mjs';

let api; let page;
test.before(async () => {
  api = await listen(createApi({}).app);
  page = await listen(createPage({ apiOrigin: api.origin }).app);
});
test.after(async () => { await api.close(); await page.close(); });

test('R0 simple: GET /ok with the page Origin answers 200 + exact allow-origin + Vary: Origin', async () => {
  const c = cid('r0s');
  const res = await raw(api.origin, `/ok?cid=${c}`, { headers: { Origin: PAGE_ORIGIN } });
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], PAGE_ORIGIN);
  assert.match(res.headers.vary ?? '', /Origin/);
  const body = JSON.parse(res.body);
  assert.equal(body.route, 'ok');
  assert.match(body.reqId, /^req-\d{5}$/);
  const log = await serverLog(api.origin, c);
  assert.equal(log.length, 1);
  assert.equal(log[0].handlerExecuted, true);
  record({ row: 'R0-simple', route: 'GET /ok', request: `GET with Origin: ${PAGE_ORIGIN} (comparison request)`, wire: summarizeWire(res), serverLog: summarizeLog(log) });
});

test('R0 preflight: OPTIONS /ok answers 204 with methods, headers and the exact origin', async () => {
  const c = cid('r0p');
  const pre = await raw(api.origin, `/ok?cid=${c}`, {
    method: 'OPTIONS',
    headers: { Origin: PAGE_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], PAGE_ORIGIN);
  assert.match(pre.headers['access-control-allow-methods'], /POST/);
  assert.match(pre.headers['access-control-allow-headers'], /Content-Type/i);
  const main = await raw(api.origin, `/ok?cid=${c}`, { method: 'POST', headers: { Origin: PAGE_ORIGIN, 'Content-Type': 'application/json' }, body: '{"hello":"lab"}' });
  assert.equal(main.status, 200);
  assert.equal(main.headers['access-control-allow-origin'], PAGE_ORIGIN);
  const log = await serverLog(api.origin, c);
  assert.equal(log.length, 2);
  assert.deepEqual(log.map((e) => e.phase), ['preflight', 'main']);
  assert.ok(log.every((e) => e.handlerExecuted));
  record({ row: 'R0-preflight', route: 'OPTIONS+POST /ok', request: 'OPTIONS then JSON POST, both with the page Origin (comparison requests)', wire: `preflight ${summarizeWire(pre)}; main ${summarizeWire(main)}`, serverLog: summarizeLog(log) });
});

test('timing fixtures: /timing/simple is correct-CORS; /timing/preflight sets Max-Age only when asked', async () => {
  const simple = await raw(api.origin, '/timing/simple', { headers: { Origin: PAGE_ORIGIN } });
  assert.equal(simple.status, 200);
  assert.equal(simple.headers['access-control-allow-origin'], PAGE_ORIGIN);
  const noCache = await raw(api.origin, '/timing/preflight', { method: 'OPTIONS', headers: { Origin: PAGE_ORIGIN, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(noCache.status, 204);
  assert.equal(noCache.headers['access-control-max-age'], undefined);
  const cached = await raw(api.origin, '/timing/preflight?maxage=600', { method: 'OPTIONS', headers: { Origin: PAGE_ORIGIN, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(cached.headers['access-control-max-age'], '600');
  record({ row: 'B4-fixtures', route: '/timing/*', request: 'OPTIONS with and without ?maxage=600 (comparison requests)', wire: `no-maxage: ${summarizeWire(noCache)}; maxage: ${summarizeWire(cached)}`, serverLog: 'preflights answered by route code (timing series themselves are browser-measured)' });
});

test('counter-case: the same "blocked" route succeeds from a Node process — CORS is browser enforcement', async () => {
  const c = cid('ccs2s');
  const res = await raw(api.origin, `/r2/no-cors?cid=${c}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"from":"node"}' });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).route, 'r2');
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  const log = await serverLog(api.origin, c);
  assert.equal(log[0].handlerExecuted, true);
  record({ row: 'CC-server-to-server', route: 'POST /r2/no-cors (from Node)', request: 'JSON POST from a Node process, no Origin header (comparison request — this IS the counter-case)', wire: summarizeWire(res), serverLog: summarizeLog(log) });
});

test('counter-case: /cc/public-wildcard answers * with credentials omitted', async () => {
  const res = await raw(api.origin, '/cc/public-wildcard', { headers: { Origin: PAGE_ORIGIN } });
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.equal(res.headers['access-control-allow-credentials'], undefined);
  record({ row: 'CC-wildcard', route: 'GET /cc/public-wildcard', request: `GET with Origin: ${PAGE_ORIGIN} (comparison request)`, wire: summarizeWire(res), serverLog: 'executed (public, cookie-less resource)' });
});

test('counter-case: the same-origin proxy route forwards server-to-server and returns the API body', async () => {
  const c = cid('ccproxy');
  const res = await raw(page.origin, `/proxy/data?cid=${c}`);
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.route, 'page-proxy');
  assert.equal(body.upstream.route, 'ok');
  assert.ok(body.proxyUpstreamMs >= 0);
  const log = await serverLog(api.origin, c);
  assert.equal(log[0].handlerExecuted, true);
  record({ row: 'CC-proxy', route: 'GET /proxy/data (page origin)', request: 'GET to the page\'s own origin; the page server forwards to the API (comparison request; the browser-side latency pair is a capture)', wire: summarizeWire(res), serverLog: summarizeLog(log) });
});

test('page server: /config.js carries the lab map; /healthz answers', async () => {
  const cfg = await raw(page.origin, '/config.js');
  assert.match(cfg.body, /window\.LAB = \{/);
  const hz = await raw(page.origin, '/healthz');
  assert.equal(JSON.parse(hz.body).ok, true);
  const index = await raw(page.origin, '/');
  assert.match(index.body, /cors-lab/);
});

test('api /healthz answers {ok:true}', async () => {
  const hz = await raw(api.origin, '/healthz');
  assert.equal(JSON.parse(hz.body).ok, true);
});
