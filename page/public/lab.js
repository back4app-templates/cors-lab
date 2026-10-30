// File: page/public/lab.js · the case runner. Every case is a plain data entry: id, label, and a request
// spec. Nothing here predicts console text — the console is captured by the coordinator per
// docs/capture-plan.md. This page only reports (a) what the fetch PROMISE saw and (b) what the SERVER
// logged for the case's cid, which are the two things JavaScript can honestly know.
/* global LAB */
(() => {
  const API = LAB.api;
  const XSITE = LAB.apiCrossSite;
  const PROXY = LAB.cacheProxy;

  document.getElementById('whoami').innerHTML =
    `This page's origin: <code>${location.origin}</code> · API (same-site name): <code>${API}</code> · ` +
    `API (cross-site name): <code>${XSITE}</code> · shared-cache proxy: <code>${PROXY}</code>`;

  // Cookie setup links (amendment B2): top-level navigations, so the cookie lands first-party with the
  // attributes of the named cell, independent of the browser's third-party-cookie policy.
  const cells = [
    ['unset', 'samesite=unset'],
    ['Lax', 'samesite=Lax'],
    ['Strict', 'samesite=Strict'],
    ['None+Secure', 'samesite=None&secure=1'],
    ['None (no Secure — browser may reject it; record that)', 'samesite=None'],
  ];
  document.getElementById('cookie-setup').innerHTML =
    '<h2>Cookie cells (set before the R4 rows — top-level, both API names)</h2><ul>' +
    cells.map(([label, qs]) =>
      `<li>${label}: <a target="_blank" href="${API}/r4/set-cookie?${qs}">${API}</a> · ` +
      `<a target="_blank" href="${XSITE}/r4/set-cookie?${qs}">${XSITE}</a></li>`).join('') +
    '</ul>';

  const CASES = [
    { id: 'R0-simple', label: 'none — positive control, simple GET', url: `${API}/ok` },
    { id: 'R0-preflight', label: 'none — positive control, preflighted (JSON POST)', url: `${API}/ok`, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"hello":"lab"}' } },
    { id: 'R2-simple-POST', label: 'no CORS handling; SIMPLE POST (text/plain) — the server EXECUTES it, the browser hides the answer', url: `${API}/r2/no-cors`, init: { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'r2 simple post' } },
    { id: 'R2-preflight', label: 'no CORS handling; PREFLIGHTED POST (JSON) — blocked before the server runs anything', url: `${API}/r2/no-cors`, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"from":"r2"}' } },
    { id: 'R3a', label: 'allowlist value has the wrong scheme', url: `${API}/r3a/wrong-scheme` },
    { id: 'R3b', label: 'allowlist value has the wrong port', url: `${API}/r3b/wrong-port` },
    { id: 'R3c', label: 'allowlist value has a trailing slash', url: `${API}/r3c/trailing-slash` },
    { id: 'R4a-samesite', label: "ACAO '*' + credentials:'include' — SIMPLE GET, same-site API name", url: `${API}/r4a/wildcard-credentials`, init: { credentials: 'include' } },
    { id: 'R4a-crosssite', label: "ACAO '*' + credentials:'include' — SIMPLE GET, cross-site API name", url: `${XSITE}/r4a/wildcard-credentials`, init: { credentials: 'include' }, stateBase: XSITE },
    { id: 'R4b', label: "ACAO '*' + credentials:'include' — PREFLIGHTED POST", url: `${API}/r4b/wildcard-credentials-preflight`, init: { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' } },
    { id: 'R4-fix', label: 'credentialed pair done right (exact origin + Allow-Credentials) — same-site', url: `${API}/r4/fix`, init: { credentials: 'include' } },
    { id: 'R4-fix-crosssite', label: 'credentialed pair done right — cross-site name', url: `${XSITE}/r4/fix`, init: { credentials: 'include' }, stateBase: XSITE },
    { id: 'R5', label: 'custom header X-Client-Version not in Access-Control-Allow-Headers', url: `${API}/r5/missing-allow-header`, init: { headers: { 'X-Client-Version': 'lab/1' } } },
    { id: 'R5-fix', label: 'same custom header against /ok (which allows it)', url: `${API}/ok`, init: { headers: { 'X-Client-Version': 'lab/1' } } },
    { id: 'R6a', label: 'the preflight is answered with a 301', url: `${API}/r6a/redirect-on-preflight`, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } },
    { id: 'R6b', label: 'the main request redirects to a target without CORS headers', url: `${API}/r6b/redirect-main` },
    { id: 'R7-ok', label: 'happy path of the throwing route (control)', url: `${API}/r7/throws` },
    { id: 'R7-boom', label: 'route crashes before setting CORS headers — 500 behind a "CORS" message', url: `${API}/r7/throws`, query: 'boom=1' },
    { id: 'R8', label: 'this origin not in the allowlist (run from http://localhost:5173 — the dev origin)', url: `${API}/ok` },
    { id: 'R11-no-cors-mode', label: "bad fix: mode:'no-cors' — opaque response, silent unreadable body", url: `${API}/r2/no-cors`, init: { mode: 'no-cors' } },
    { id: 'R12', label: 'duplicate Access-Control-Allow-Origin headers', url: `${API}/r12/duplicate-allow-origin` },
    { id: 'R13-no-vary', label: 'via shared cache, response reflects Origin WITHOUT Vary: Origin (warm on one origin, read on the other)', url: `${PROXY}/r13/reflect-no-vary`, stateBase: null },
    { id: 'R13-with-vary', label: 'via shared cache, WITH Vary: Origin (the fix)', url: `${PROXY}/r13/reflect-with-vary`, stateBase: null },
    { id: 'CC-wildcard', label: "counter-case: public cookie-less resource, '*' + credentials omitted", url: `${API}/cc/public-wildcard` },
    { id: 'CC-proxy-vs-direct', label: 'counter-case: same-origin proxy vs direct call (one timed observation each, same session)', special: 'proxy' },
    { id: 'CC-reflect-origin', label: 'anti-pattern (OFF by default): reflect Origin + credentials — 404 unless UNSAFE_REFLECT_ORIGIN=1', url: `${API}/unsafe/reflect-origin`, init: { credentials: 'include' } },
  ];

  const tbody = document.querySelector('#cases tbody');

  function show(td, cls, text) { td.className = `out ${cls}`; td.textContent = text; }

  async function describeFetch(url, init) {
    try {
      const res = await fetch(url, init);
      let body;
      try { body = await res.text(); } catch (e) { body = `(body unreadable: ${e.name}: ${e.message})`; }
      return { kind: 'resolved', text: `RESOLVED\nstatus: ${res.status}\nok: ${res.ok}\ntype: ${res.type}\nredirected: ${res.redirected}\nbody: ${body === '' ? '(empty string)' : body.slice(0, 400)}` };
    } catch (err) {
      return { kind: 'rejected', text: `REJECTED\n${err.name}: ${err.message}` };
    }
  }

  async function serverLog(stateBase, cid) {
    if (stateBase === null) return '(target has no /__state — read the proxy/API stdout; cid=' + cid + ')';
    try {
      const res = await fetch(`${stateBase}/__state?cid=${encodeURIComponent(cid)}`);
      const { log } = await res.json();
      if (!log.length) return `NOTHING REACHED THE SERVER for cid=${cid} (no preflight, no main request)`;
      return log.map((e) =>
        `${e.reqId} ${e.phase} ${e.method} ${e.path} → status ${e.status}, handler executed: ${e.handlerExecuted}${e.note ? ` (${e.note})` : ''}`).join('\n');
    } catch (e) {
      return `(could not read /__state: ${e.name}: ${e.message})`;
    }
  }

  async function run(c, tdFetch, tdLog) {
    const cid = `${c.id}-${Date.now().toString(36)}`;
    show(tdFetch, '', 'running…'); show(tdLog, '', '');
    if (c.special === 'proxy') {
      const t0 = performance.now();
      const direct = await describeFetch(`${API}/ok?cid=${cid}-direct`);
      const t1 = performance.now();
      const proxied = await describeFetch(`/proxy/data?cid=${cid}-proxy`);
      const t2 = performance.now();
      show(tdFetch, 'resolved',
        `direct ${(t1 - t0).toFixed(1)} ms · proxied ${(t2 - t1).toFixed(1)} ms (single observation, same session)\n--- direct ---\n${direct.text}\n--- proxied ---\n${proxied.text}`);
      show(tdLog, '', await serverLog(API, `${cid}-direct`) + '\n' + await serverLog(API, `${cid}-proxy`));
      return;
    }
    const sep = c.url.includes('?') ? '&' : '?';
    const url = `${c.url}${sep}cid=${cid}${c.query ? `&${c.query}` : ''}`;
    const outcome = await describeFetch(url, c.init);
    show(tdFetch, outcome.kind, outcome.text);
    const stateBase = c.stateBase === undefined ? API : c.stateBase;
    const logText = await serverLog(stateBase, cid);
    const executed = /handler executed: true/.test(logText);
    show(tdLog, executed ? 'exec-yes' : 'exec-no', logText);
  }

  for (const c of CASES) {
    const tr = document.createElement('tr');
    const tdFetch = document.createElement('td');
    const tdLog = document.createElement('td');
    const tdBtn = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'Run';
    btn.id = `run-${c.id}`;
    btn.onclick = () => run(c, tdFetch, tdLog);
    tdBtn.appendChild(btn);
    tr.innerHTML = `<td><code>${c.id}</code></td><td>${c.label}</td>`;
    tr.appendChild(tdBtn); tr.appendChild(tdFetch); tr.appendChild(tdLog);
    tbody.appendChild(tr);
  }
})();
