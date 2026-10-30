// File: scripts/make-cert.mjs · mints a throwaway self-signed cert for the https page origin
// (https://localhost:1349). Local only, gitignored, 30 days. Accept the browser warning once and record
// that the page still reports isSecureContext=true (that is itself a capture note).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const certDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'page', 'cert');
mkdirSync(certDir, { recursive: true });

// LibreSSL (macOS /usr/bin/openssl) may lack -addext, so the SAN goes through a config file.
const cnf = path.join(os.tmpdir(), `cors-lab-openssl-${process.pid}.cnf`);
writeFileSync(cnf, `
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = localhost
[v3]
subjectAltName = DNS:localhost, IP:127.0.0.1
basicConstraints = CA:FALSE
`);
try {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30',
    '-keyout', path.join(certDir, 'key.pem'),
    '-out', path.join(certDir, 'cert.pem'),
    '-config', cnf,
  ], { stdio: 'inherit' });
  console.log(`cert written to ${certDir} (gitignored). Restart the page server to get https://localhost:1349.`);
} finally {
  rmSync(cnf, { force: true });
}
