// File: server.js · Containers entry point. One repo, two apps: SERVICE=api runs the backend origin,
// SERVICE=page runs the static frontend origin. Each listens on PORT (Containers sets 8080).
const service = process.env.SERVICE || 'api';
if (service === 'page') { await import('./page/server.mjs'); } else { await import('./api/server.mjs'); }
