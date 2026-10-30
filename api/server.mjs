// File: api/server.mjs · starts the backend origin on PORT (default 1345).
// Reachable as http://localhost:1345 (same-site with the page) AND http://127.0.0.1:1345
// (cross-site with the page) — one server, two names, used by the cookie rows.
import { createApi } from './app.mjs';

const port = Number(process.env.PORT) || 1345;
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : undefined;

const { app, allowed } = createApi({
  allowedOrigins,
  unsafeReflectOrigin: process.env.UNSAFE_REFLECT_ORIGIN === '1',
});

app.listen(port, () => {
  console.log(`[api] backend origin on http://localhost:${port} (cross-site name: http://127.0.0.1:${port})`);
  console.log(`[api] allowlist: ${allowed.join(', ')}`);
  if (process.env.UNSAFE_REFLECT_ORIGIN === '1') {
    console.log('[api] WARNING: /unsafe/reflect-origin is registered (UNSAFE_REFLECT_ORIGIN=1) — lab use only');
  }
});
