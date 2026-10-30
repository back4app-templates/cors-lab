// R13 (missing Vary: Origin behind a shared cache) through the real cache proxy, and the R9′ relay's
// wire behaviour (the LNA outcome itself is a browser capture; this only proves the fixture).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api/app.mjs';
import { createCacheProxy } from '../cache/proxy.mjs';
import { createRelay } from '../relay/relay.mjs';
import { listen, raw, summarizeWire, record, cid, PAGE_ORIGIN, DEV_ORIGIN } from './helpers.mjs';

let api; let proxy;
test.before(async () => {
  api = await listen(createApi({}).app);
  proxy = await listen(createCacheProxy({ target: api.origin }).server);
});
test.after(async () => { await proxy.close(); await api.close(); });

test('R13 no Vary: the shared cache serves origin A\'s allow-origin to origin B', async () => {
  const path = `/r13/reflect-no-vary?cid=${cid('r13')}`;
  const a = await raw(proxy.origin, path, { headers: { Origin: PAGE_ORIGIN } });
  assert.equal(a.headers['x-lab-cache'], 'MISS');
  assert.equal(a.headers['access-control-allow-origin'], PAGE_ORIGIN);
  const b = await raw(proxy.origin, path, { headers: { Origin: DEV_ORIGIN } });
  assert.equal(b.headers['x-lab-cache'], 'HIT');
  assert.equal(b.headers['access-control-allow-origin'], PAGE_ORIGIN, "origin B received origin A's header — the right header served to the wrong origin");
  assert.equal(b.headers['x-lab-cached-from-origin'], PAGE_ORIGIN);
  record({ row: 'R13-no-vary', route: 'GET /r13/reflect-no-vary (via cache proxy)', request: `GET with Origin A (${PAGE_ORIGIN}), then the SAME URL with Origin B (${DEV_ORIGIN}) (comparison requests)`, wire: `A: ${summarizeWire(a)}; B: ${summarizeWire(b)}`, serverLog: 'A reached the API (MISS); B was answered from the shared cache — the API never saw B\'s request' });
});

test('R13 with Vary: Origin: the same cache stores per origin and each origin gets its own header', async () => {
  const path = `/r13/reflect-with-vary?cid=${cid('r13v')}`;
  const a = await raw(proxy.origin, path, { headers: { Origin: PAGE_ORIGIN } });
  assert.equal(a.headers['x-lab-cache'], 'MISS');
  const b = await raw(proxy.origin, path, { headers: { Origin: DEV_ORIGIN } });
  assert.equal(b.headers['x-lab-cache'], 'MISS', 'Vary: Origin keyed the cache per origin');
  assert.equal(b.headers['access-control-allow-origin'], DEV_ORIGIN);
  const b2 = await raw(proxy.origin, path, { headers: { Origin: DEV_ORIGIN } });
  assert.equal(b2.headers['x-lab-cache'], 'HIT');
  assert.equal(b2.headers['access-control-allow-origin'], DEV_ORIGIN);
  record({ row: 'R13-with-vary', route: 'GET /r13/reflect-with-vary (via cache proxy)', request: 'same two-origin sequence as R13-no-vary (comparison requests)', wire: `A: ${summarizeWire(a)}; B first: ${summarizeWire(b)}; B repeat: ${summarizeWire(b2)}`, serverLog: 'the one-line fix (Vary: Origin) makes the shared cache safe per origin' });
});

test('R9′ relay: GET answers with ACAO *, OPTIONS is unhandled (404) — fixture proven, LNA outcome is a capture', async () => {
  const relay = await listen(createRelay());
  const get = await raw(relay.origin, '/ping?cid=wire');
  assert.equal(get.status, 200);
  assert.equal(get.headers['access-control-allow-origin'], '*');
  assert.equal(JSON.parse(get.body).route, 'relay');
  const opt = await raw(relay.origin, '/ping', { method: 'OPTIONS', headers: { Origin: 'https://localhost:1349', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(opt.status, 404);
  assert.equal(opt.headers['access-control-allow-origin'], '*');
  await relay.close();
  record({ row: 'R9-relay-wire', route: 'GET + OPTIONS on the relay', request: 'comparison requests against the LNA fixture target', wire: `GET: ${summarizeWire(get)}; OPTIONS: ${summarizeWire(opt)}`, serverLog: 'relay logs every request to stdout with an id — under a denied LNA permission the ABSENCE of a line is the evidence (capture plan)' });
});
