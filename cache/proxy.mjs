// File: cache/proxy.mjs · a deliberately naive shared cache in front of the API, for R13.
// It caches GET responses by METHOD+URL. If the cached response carries `Vary: Origin` it is stored and
// matched per request-Origin (what a correct shared cache does); if it does not, the first origin's
// response — including its Access-Control-Allow-Origin header — is served to EVERY later origin.
// That naivety is the point: it reproduces "the right header served to the wrong origin".
import http from 'node:http';

export function createCacheProxy({ target }) {
  const cache = new Map(); // key -> { status, headers, body (Buffer), varyOrigin, origin }
  const stats = { hits: 0, misses: 0 };

  const server = http.createServer(async (req, res) => {
    if (req.url === '/__cache') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ stats, keys: [...cache.keys()] }));
    }
    if (req.method !== 'GET') { res.statusCode = 405; return res.end('cache proxy: GET only'); }

    const origin = req.headers.origin ?? null;
    const baseKey = `GET ${req.url}`;
    // A cached entry with Vary: Origin is keyed per origin; one without is keyed for everyone.
    const entry = cache.get(baseKey) ?? cache.get(`${baseKey} @${origin}`);
    if (entry && (!entry.varyOrigin || entry.origin === origin)) {
      stats.hits += 1;
      console.log(`[cache] HIT  ${baseKey} origin=${origin ?? '-'} (cached from origin=${entry.origin ?? '-'})`);
      for (const [k, v] of Object.entries(entry.headers)) res.setHeader(k, v);
      res.setHeader('X-Lab-Cache', 'HIT');
      res.setHeader('X-Lab-Cached-From-Origin', entry.origin ?? 'none');
      res.statusCode = entry.status;
      return res.end(entry.body);
    }

    stats.misses += 1;
    try {
      const upstream = await fetch(`${target}${req.url}`, { headers: origin ? { origin } : {} });
      const body = Buffer.from(await upstream.arrayBuffer());
      const headers = {};
      for (const name of ['content-type', 'access-control-allow-origin', 'vary']) {
        const v = upstream.headers.get(name);
        if (v !== null) headers[name] = v;
      }
      const varyOrigin = (upstream.headers.get('vary') ?? '').toLowerCase().split(',').map((s) => s.trim()).includes('origin');
      const stored = { status: upstream.status, headers, body, varyOrigin, origin };
      cache.set(varyOrigin ? `${baseKey} @${origin}` : baseKey, stored);
      console.log(`[cache] MISS ${baseKey} origin=${origin ?? '-'} vary-origin=${varyOrigin}`);
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      res.setHeader('X-Lab-Cache', 'MISS');
      res.statusCode = upstream.status;
      res.end(body);
    } catch (err) {
      res.statusCode = 502;
      res.end(`cache proxy: upstream failed: ${err}`);
    }
  });
  return { server, cache, stats };
}

const { pathToFileURL } = await import('node:url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 1348;
  const target = process.env.TARGET || 'http://localhost:1345';
  createCacheProxy({ target }).server.listen(port, () =>
    console.log(`[cache] shared-cache proxy on http://localhost:${port} → ${target} (R13 fixture)`));
}
