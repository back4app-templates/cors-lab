// File: api/app.mjs · the "backend origin" of the CORS lab (default http://localhost:1345, also reachable
// as http://127.0.0.1:1345 — same server, different site for cookie rows).
//
// Design rule (house, one factor at a time): /ok is the fully correct configuration and the positive
// control. Every other route is /ok with EXACTLY ONE thing changed, named in the comment above the route
// and in docs/capture-plan.md. Same app, same origin, same payload shape.
//
// Execution logging (amendment B3): every request — preflight OPTIONS and main alike — gets a server-side
// REQUEST ID and a log entry; a handler that actually runs marks its entry `handlerExecuted: true`. The
// page sends a correlation id as the `cid` QUERY PARAM (never a header: a custom header would change the
// request's CORS classification). GET /__state exposes counters + the log so every matrix row can record,
// from the server's own log, whether "the preflight blocked it — no main request executed" or "the request
// ran and the browser merely refused to expose the response". Those are distinct outcomes, always.

import express from 'express';

export const DEFAULT_PAGE_ORIGIN = 'http://localhost:1346';
// Default allowlist: the main page origin and the https page origin (so the mixed-content fixture's one
// changed factor is the scheme of the TARGET, not CORS). The dev origin :5173 is deliberately NOT here — R8.
export const DEFAULT_ALLOWED = [DEFAULT_PAGE_ORIGIN, 'https://localhost:1349'];

export function createApi(options = {}) {
  const allowed = options.allowedOrigins ?? DEFAULT_ALLOWED;
  const pageOrigin = options.pageOrigin ?? DEFAULT_PAGE_ORIGIN;
  const unsafeReflect = options.unsafeReflectOrigin ?? false;

  const state = {
    counters: Object.create(null), // route executions (main handlers only)
    log: [],                       // ring buffer of request entries, newest last
    nextId: 1,
  };
  const LOG_MAX = 1000;

  function bump(name) { state.counters[name] = (state.counters[name] ?? 0) + 1; }

  const app = express();
  app.disable('x-powered-by');

  // -- request log -------------------------------------------------------------------------------
  app.use((req, res, next) => {
    // Introspection never enters the reproduction log (reading the log must not write to it).
    if (req.path === '/__state' || req.path === '/healthz') {
      req.lab = { entry: null, executed() {} };
      return next();
    }
    const entry = {
      reqId: `req-${String(state.nextId++).padStart(5, '0')}`,
      at: new Date().toISOString(),
      method: req.method,
      path: req.path,
      cid: typeof req.query.cid === 'string' ? req.query.cid : null,
      origin: req.headers.origin ?? null,
      cookieNames: req.headers.cookie
        ? req.headers.cookie.split(';').map((c) => c.split('=')[0].trim())
        : [],
      phase: req.method === 'OPTIONS' ? 'preflight' : 'main',
      handlerExecuted: false, // our route code ran (an Express-default OPTIONS answer stays false)
      note: null,
      status: null,
      responseAllowOrigin: null,
    };
    state.log.push(entry);
    if (state.log.length > LOG_MAX) state.log.shift();
    req.lab = {
      entry,
      executed(note) {
        entry.handlerExecuted = true;
        if (note) entry.note = note;
      },
    };
    res.on('finish', () => {
      entry.status = res.statusCode;
      const acao = res.getHeader('access-control-allow-origin');
      entry.responseAllowOrigin = acao === undefined ? null : acao;
    });
    // Console line per request — this is the access-log view the article quotes.
    res.on('finish', () => {
      console.log(
        `[api] ${entry.reqId} ${entry.phase.padEnd(9)} ${entry.method} ${req.originalUrl} ` +
        `origin=${entry.origin ?? '-'} status=${entry.status} executed=${entry.handlerExecuted}` +
        (entry.cid ? ` cid=${entry.cid}` : ''),
      );
    });
    next();
  });

  // -- helpers -----------------------------------------------------------------------------------
  const matched = (req) => (allowed.includes(req.headers.origin) ? req.headers.origin : null);

  function allowOrigin(res, value) {
    if (value) res.set('Access-Control-Allow-Origin', value);
    res.append('Vary', 'Origin');
  }

  // The correct preflight answer (/ok's): used verbatim unless the route's one factor is in it.
  function preflightOk(req, res, { origin = matched(req), allowHeaders = 'Content-Type, X-Client-Version', maxAge = null, credentials = false } = {}) {
    req.lab.executed('preflight answered by route code');
    allowOrigin(res, origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    if (allowHeaders) res.set('Access-Control-Allow-Headers', allowHeaders);
    if (maxAge !== null) res.set('Access-Control-Max-Age', String(maxAge));
    if (credentials) res.set('Access-Control-Allow-Credentials', 'true');
    res.status(204).end();
  }

  function reply(req, res, route, extra = {}) {
    req.lab.executed();
    bump(route);
    res.json({
      route,
      reqId: req.lab.entry.reqId,
      cid: req.lab.entry.cid,
      method: req.method,
      at: req.lab.entry.at,
      youSent: {
        origin: req.headers.origin ?? null,
        contentType: req.headers['content-type'] ?? null,
        cookieNames: req.lab.entry.cookieNames,
      },
      ...extra,
    });
  }

  // -- R0 · /ok — positive control. Allowlist from env, credentials off. Captured FIRST. ----------
  app.options('/ok', (req, res) => preflightOk(req, res));
  app.get('/ok', (req, res) => { allowOrigin(res, matched(req)); reply(req, res, 'ok'); });
  app.post('/ok', (req, res) => { allowOrigin(res, matched(req)); reply(req, res, 'ok'); });

  // -- R2 · one factor: NO CORS handling at all (handler body identical to /ok's). ----------------
  // No OPTIONS route either: Express answers OPTIONS itself (status/Allow header captured by the wire
  // test — not assumed). A simple POST here still EXECUTES (counter r2 moves) while the browser hides
  // the response; a preflighted POST never reaches the handler. R11 (mode:'no-cors') reuses this route.
  app.get('/r2/no-cors', (req, res) => reply(req, res, 'r2'));
  app.post('/r2/no-cors', (req, res) => reply(req, res, 'r2'));

  // -- R3 · one factor each: the allowlist VALUE is wrong (requests kept simple deliberately). -----
  const r3Value = {
    // scheme flipped relative to the page origin
    r3a: pageOrigin.startsWith('https://') ? pageOrigin.replace('https://', 'http://') : pageOrigin.replace('http://', 'https://'),
    // right host, wrong port
    r3b: pageOrigin.replace(/:\d+$/, ':1399'),
    // trailing slash — an origin is scheme+host+port, never a path
    r3c: `${pageOrigin}/`,
  };
  app.get('/r3a/wrong-scheme', (req, res) => { allowOrigin(res, r3Value.r3a); reply(req, res, 'r3a', { allowOriginSent: r3Value.r3a }); });
  app.get('/r3b/wrong-port', (req, res) => { allowOrigin(res, r3Value.r3b); reply(req, res, 'r3b', { allowOriginSent: r3Value.r3b }); });
  app.get('/r3c/trailing-slash', (req, res) => { allowOrigin(res, r3Value.r3c); reply(req, res, 'r3c', { allowOriginSent: r3Value.r3c }); });

  // -- R4 · cookies. Attributes controlled per cell (amendment B2). --------------------------------
  // Sets a cookie named after the cell. Works top-level (open the URL in a tab: first-party, no CORS)
  // and as a correctly-credentialed fetch. Query: samesite=Lax|Strict|None|unset · secure=1 · domain=…
  app.options('/r4/set-cookie', (req, res) => preflightOk(req, res, { credentials: true }));
  app.get('/r4/set-cookie', (req, res) => {
    const ss = typeof req.query.samesite === 'string' ? req.query.samesite : 'unset';
    const secure = req.query.secure === '1';
    const domain = typeof req.query.domain === 'string' ? req.query.domain : null;
    const name = `lab_${ss.toLowerCase()}${secure ? '_secure' : ''}${domain ? '_domain' : ''}`;
    let cookie = `${name}=1; Path=/; Max-Age=3600`;
    if (ss !== 'unset') cookie += `; SameSite=${ss}`;
    if (secure) cookie += '; Secure';
    if (domain) cookie += `; Domain=${domain}`;
    res.set('Set-Cookie', cookie);
    allowOrigin(res, matched(req));
    res.set('Access-Control-Allow-Credentials', 'true');
    reply(req, res, 'r4-set-cookie', { setCookieSent: cookie });
  });

  // -- R4a · one factor: ACAO '*' + the page uses credentials:'include' — SIMPLE request. ----------
  // No preflight is involved: the request REACHES the server and executes (log/counter prove it);
  // the browser only refuses to expose the response. Distinct row from R4b by design (amendment B2/B3).
  app.get('/r4a/wildcard-credentials', (req, res) => {
    allowOrigin(res, '*');
    reply(req, res, 'r4a', { cookieArrived: req.lab.entry.cookieNames.length > 0 });
  });

  // -- R4b · same single factor ('*' with credentials) but the request is PREFLIGHTED. -------------
  // The preflight answer carries the wildcard, so a credentialed caller is blocked BEFORE the main
  // request: the main handler never runs (log shows preflight only).
  app.options('/r4b/wildcard-credentials-preflight', (req, res) => preflightOk(req, res, { origin: '*' }));
  app.post('/r4b/wildcard-credentials-preflight', (req, res) => {
    allowOrigin(res, '*');
    reply(req, res, 'r4b', { cookieArrived: req.lab.entry.cookieNames.length > 0 });
  });

  // -- R4 fix · exact origin + Allow-Credentials: true (the credentialed pair done right). ---------
  app.options('/r4/fix', (req, res) => preflightOk(req, res, { credentials: true }));
  app.get('/r4/fix', (req, res) => {
    allowOrigin(res, matched(req));
    res.set('Access-Control-Allow-Credentials', 'true');
    reply(req, res, 'r4-fix', { cookieArrived: req.lab.entry.cookieNames.length > 0 });
  });
  app.post('/r4/fix', (req, res) => {
    allowOrigin(res, matched(req));
    res.set('Access-Control-Allow-Credentials', 'true');
    reply(req, res, 'r4-fix', { cookieArrived: req.lab.entry.cookieNames.length > 0 });
  });

  // -- R5 · one factor: Access-Control-Allow-Headers lists Content-Type but NOT X-Client-Version. --
  // The preflight succeeds as HTTP (204) and fails as CORS. /ok (which allows the header) is the fix.
  app.options('/r5/missing-allow-header', (req, res) => preflightOk(req, res, { allowHeaders: 'Content-Type' }));
  app.get('/r5/missing-allow-header', (req, res) => { allowOrigin(res, matched(req)); reply(req, res, 'r5'); });

  // -- R6a · one factor: the PREFLIGHT is answered with a redirect (a preflight must not redirect). -
  app.options('/r6a/redirect-on-preflight', (req, res) => {
    req.lab.executed('preflight answered with 301');
    res.redirect(301, '/ok');
  });
  app.post('/r6a/redirect-on-preflight', (req, res) => { allowOrigin(res, matched(req)); reply(req, res, 'r6a'); });

  // -- R6b · one factor: the MAIN request redirects to a target that lacks the headers. ------------
  // The 301 itself carries correct CORS headers so the only failing factor is the target.
  app.get('/r6b/redirect-main', (req, res) => {
    req.lab.executed('301 to /r6b/target');
    allowOrigin(res, matched(req));
    res.redirect(301, `/r6b/target${req.query.cid ? `?cid=${encodeURIComponent(String(req.query.cid))}` : ''}`);
  });
  app.get('/r6b/target', (req, res) => reply(req, res, 'r6b-target')); // no CORS headers — the factor

  // -- R7 · one factor: the error path skips the CORS headers the happy path sets (H2). ------------
  // ?boom=1 → the handler RUNS (counter moves, log says executed) and throws BEFORE setting headers;
  // Express's default error handler answers 500 with no ACAO → the console will say CORS while the
  // real bug is the 500. The misleading case.
  app.options('/r7/throws', (req, res) => preflightOk(req, res));
  const r7 = (req, res) => {
    req.lab.executed(req.query.boom === '1' ? 'handler ran, then threw (no CORS headers set)' : null);
    bump('r7-ran');
    if (req.query.boom === '1') throw new Error('cors-lab r7: synthetic failure before CORS headers were set');
    allowOrigin(res, matched(req));
    reply(req, res, 'r7');
  };
  app.get('/r7/throws', r7);
  app.post('/r7/throws', r7);

  // -- R12 · one factor: Access-Control-Allow-Origin set TWICE (middleware + hand-set header). -----
  app.get('/r12/duplicate-allow-origin', (req, res) => {
    const o = matched(req) ?? pageOrigin;
    res.append('Access-Control-Allow-Origin', o); // "the middleware"
    res.append('Access-Control-Allow-Origin', o); // "the hand-set fix on top"
    res.append('Vary', 'Origin');
    reply(req, res, 'r12');
  });

  // -- R13 · one factor: per-origin responses WITHOUT Vary: Origin, behind a shared cache. ---------
  // Reflects the request Origin (common middleware behaviour, credentials OFF here). Run through
  // cache/proxy.mjs: origin A warms the cache, origin B receives A's Allow-Origin. The sibling route
  // adds Vary: Origin and the same proxy then caches per origin.
  app.get('/r13/reflect-no-vary', (req, res) => {
    if (req.headers.origin) res.set('Access-Control-Allow-Origin', req.headers.origin);
    reply(req, res, 'r13-no-vary', { reflected: req.headers.origin ?? null });
  });
  app.get('/r13/reflect-with-vary', (req, res) => {
    if (req.headers.origin) res.set('Access-Control-Allow-Origin', req.headers.origin);
    res.append('Vary', 'Origin');
    reply(req, res, 'r13-with-vary', { reflected: req.headers.origin ?? null });
  });

  // -- Timing fixtures (§6.1 / amendment B4) — correct CORS; the only knob is Max-Age. -------------
  // /timing/simple: a simple GET (no preflight). /timing/preflight: forced preflight (the page sends
  // Content-Type: application/json); OPTIONS sets Access-Control-Max-Age ONLY when ?maxage=N is in the
  // URL (the preflight cache key includes the URL, so cached vs uncached series use distinct URLs).
  app.get('/timing/simple', (req, res) => { allowOrigin(res, matched(req)); reply(req, res, 'timing-simple'); });
  app.options('/timing/preflight', (req, res) => {
    const m = typeof req.query.maxage === 'string' ? Number(req.query.maxage) : null;
    preflightOk(req, res, { maxAge: Number.isFinite(m) ? m : null });
  });
  app.post('/timing/preflight', (req, res) => { allowOrigin(res, matched(req)); reply(req, res, 'timing-preflight'); });

  // -- Counter-case · a public, cookie-less resource: '*' with credentials omitted is correct. -----
  app.get('/cc/public-wildcard', (req, res) => { allowOrigin(res, '*'); reply(req, res, 'cc-wildcard'); });

  // -- Anti-pattern (counter-case, amendment-9 pattern: OFF by default, never in a default deploy) --
  // Reflecting the Origin header WITH credentials allowed turns the allowlist off while looking
  // configured. Registered only when UNSAFE_REFLECT_ORIGIN=1.
  if (unsafeReflect) {
    app.options('/unsafe/reflect-origin', (req, res) => preflightOk(req, res, { origin: req.headers.origin ?? '*', credentials: true }));
    app.get('/unsafe/reflect-origin', (req, res) => {
      if (req.headers.origin) res.set('Access-Control-Allow-Origin', req.headers.origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.append('Vary', 'Origin');
      reply(req, res, 'unsafe-reflect', {
        warning: 'ANTI-PATTERN — any origin can read this credentialed response. Never ship this.',
        cookieArrived: req.lab.entry.cookieNames.length > 0,
      });
    });
  }

  // -- Lab introspection (not part of any reproduction; ACAO '*' so the page can self-report). -----
  app.get('/healthz', (req, res) => { req.lab.executed(); res.json({ ok: true }); });
  app.get('/__state', (req, res) => {
    req.lab.executed();
    res.set('Access-Control-Allow-Origin', '*');
    const cid = typeof req.query.cid === 'string' ? req.query.cid : null;
    const log = cid ? state.log.filter((e) => e.cid === cid) : state.log.slice(-100);
    res.json({ counters: state.counters, allowedOrigins: allowed, log });
  });

  return { app, state, allowed };
}
