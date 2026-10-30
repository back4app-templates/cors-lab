// File: page/app.mjs · the "frontend origin": serves the static lab page and the counter-case proxy.
// The same app listens on three names (page/server.mjs): http://localhost:1346 (origin A, the main page),
// http://localhost:5173 (origin B, the "dev server" of R8 and the second origin of R13), and
// https://localhost:1349 (the secure context for the mixed-content and LNA fixtures; needs `npm run cert`).
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

export function createPage(options = {}) {
  const apiOrigin = options.apiOrigin ?? 'http://localhost:1345';
  const apiCrossSite = options.apiCrossSite ?? 'http://127.0.0.1:1345';
  const cacheProxy = options.cacheProxy ?? 'http://localhost:1348';
  const relay = options.relay ?? 'http://127.0.0.1:1347';

  const app = express();
  app.disable('x-powered-by');

  // House pattern: runtime config as /config.js, never baked into the HTML.
  app.get('/config.js', (req, res) => {
    res.type('application/javascript').send(
      `window.LAB = ${JSON.stringify({ api: apiOrigin, apiCrossSite, cacheProxy, relay })};\n`,
    );
  });

  // Counter-case: the same-origin proxy route. The page calls ITS OWN origin; this ~10-line route
  // forwards to the API server-to-server — no browser, no CORS. Returns the API body plus the
  // proxy-side duration so the browser capture can compare it with its own same-session direct call.
  app.get('/proxy/data', async (req, res) => {
    const cid = typeof req.query.cid === 'string' ? `?cid=${encodeURIComponent(req.query.cid)}` : '';
    const t0 = performance.now();
    try {
      const upstream = await fetch(`${apiOrigin}/ok${cid}`);
      const body = await upstream.json();
      res.json({ route: 'page-proxy', upstreamStatus: upstream.status, proxyUpstreamMs: +(performance.now() - t0).toFixed(1), upstream: body });
    } catch (err) {
      res.status(502).json({ route: 'page-proxy', error: String(err) });
    }
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use(express.static(publicDir, { extensions: ['html'] }));
  return { app };
}
