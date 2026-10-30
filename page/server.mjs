// File: page/server.mjs · serves the frontend origin on 1346, the dev origin on 5173 and,
// when page/cert/ exists (npm run cert), the https origin on 1349.
import http from 'node:http';
import https from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPage } from './app.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { app } = createPage({
  apiOrigin: process.env.API_ORIGIN || 'http://localhost:1345',
  apiCrossSite: process.env.API_CROSS_SITE || 'http://127.0.0.1:1345',
  cacheProxy: process.env.CACHE_PROXY || 'http://localhost:1348',
  relay: process.env.RELAY || 'http://127.0.0.1:1347',
});

const mainPort = Number(process.env.PORT) || 1346;
const devPort = Number(process.env.DEV_PORT) || 5173;
http.createServer(app).listen(mainPort, () => console.log(`[page] origin A (main page)  http://localhost:${mainPort}`));
http.createServer(app).listen(devPort, () => console.log(`[page] origin B ("dev server") http://localhost:${devPort}`));

const certDir = path.join(here, 'cert');
if (existsSync(path.join(certDir, 'cert.pem'))) {
  const httpsPort = Number(process.env.HTTPS_PORT) || 1349;
  https
    .createServer({ key: readFileSync(path.join(certDir, 'key.pem')), cert: readFileSync(path.join(certDir, 'cert.pem')) }, app)
    .listen(httpsPort, () => console.log(`[page] secure context         https://localhost:${httpsPort} (self-signed — accept the warning once)`));
} else {
  console.log('[page] https origin not started: run `npm run cert` first (needed for the mixed-content and LNA secure-context cells)');
}
