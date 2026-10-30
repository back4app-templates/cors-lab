# cors-lab

Companion lab for the Back4app blog post *How to Fix CORS Errors When Your Frontend Calls Your Backend*
(brief `brief-cors-errors-blog-post-v1.md` + amendments of 2026-10-30; the amendments win). Same family as
`deploy-failure-lab` and `tenant-lab`.

One Express API where **`/ok` is the fully correct configuration and every other route is `/ok` with
exactly one thing changed**, plus a static page origin with one button per failure. Every route logs a
request id; every reproduction records, from the server's own log, whether the request **executed** —
because "the preflight blocked it (nothing ran)" and "it ran and the browser refused to expose the
response" are different failures, and only the second one matters for a non-idempotent POST.

## Run it

```text
npm install
npm run cert   # once — self-signed cert for the https page origin (mixed-content / secure-context cells)
npm run dev    # starts all five local pieces
npm test       # Node-verifiable wire checks; writes docs/evidence/wire-matrix-local-<date>.md
```

| Piece | URL | Role |
|---|---|---|
| page A | http://localhost:1346 | the frontend origin (in the API allowlist) |
| page B | http://localhost:5173 | the "dev server" origin (NOT in the allowlist — R8; second origin for R13) |
| page https | https://localhost:1349 | secure context (allowlisted); mixed-content and LNA cells |
| API | http://localhost:1345 | the backend origin; also reachable as http://127.0.0.1:1345 — same server, **different site**, used by the cookie rows |
| relay | http://127.0.0.1:1347 | the local helper of the Local Network Access fixture (R9′) |
| cache proxy | http://localhost:1348 | deliberately naive shared cache in front of the API (R13) |

## Cause → route

| Row | One factor changed | Route |
|---|---|---|
| R0 | none — positive control (simple + preflighted) | `GET/POST /ok` |
| R2 | no CORS handling at all (simple POST executes; preflighted POST never runs) | `POST /r2/no-cors` |
| R3a | allowlist value: wrong scheme | `GET /r3a/wrong-scheme` |
| R3b | allowlist value: wrong port | `GET /r3b/wrong-port` |
| R3c | allowlist value: trailing slash | `GET /r3c/trailing-slash` |
| R4a | `*` + `credentials:'include'`, **simple** — reaches the server, JS cannot read | `GET /r4a/wildcard-credentials` |
| R4b | `*` + `credentials:'include'`, **preflighted** — blocked before the server | `POST /r4b/wildcard-credentials-preflight` |
| R4 fix | exact origin + `Allow-Credentials: true` (cookie cells set via `/r4/set-cookie`) | `GET/POST /r4/fix` |
| R5 | custom header missing from `Access-Control-Allow-Headers` | `GET /r5/missing-allow-header` |
| R6a | preflight answered with a 301 | `POST /r6a/redirect-on-preflight` |
| R6b | main request redirects to a target without the headers | `GET /r6b/redirect-main` |
| R7 | error path skips the headers the happy path sets (`?boom=1` → 500, no ACAO) | `GET/POST /r7/throws` |
| R8 | calling origin not in the allowlist (run the page from :5173) | `GET /ok` |
| R9′ | Chrome Local Network Access: page → local relay (permission-based; outcome per state **to capture**) | relay `GET /ping` + `/lna.html` |
| R11 | bad fix: `mode:'no-cors'` — opaque response, silent unreadable body | page button against `/r2/no-cors` |
| R12 | duplicate `Access-Control-Allow-Origin` headers | `GET /r12/duplicate-allow-origin` |
| R13 | per-origin responses without `Vary: Origin` behind a shared cache | `GET /r13/reflect-no-vary` via :1348 (fix: `/r13/reflect-with-vary`) |
| §6.1 | preflight-tax series (cold / cached / simple — separate series) | `/timing/*` + `/timing.html` |
| CC | counter-cases: server-to-server, same-origin proxy, public `*`, reflect-origin anti-pattern (flag-gated, OFF) | `/proxy/data` (page), `/cc/public-wildcard`, `/unsafe/reflect-origin` |

R1 (the managed REST API / H1) has no local fixture: it is a live-phase probe of `parseapi.back4app.com`.

## Evidence discipline

- `npm test` sends **comparison requests** (a Node HTTP client, no browser): they show what the server
  answers to an equivalent request and are never proof about a browser request. Output:
  `docs/evidence/wire-matrix-local-<date>.md`.
- Browser console text, network-tab statuses and cookie/permission behaviour are captured only from a
  real, pinned browser per `docs/capture-plan.md`. **No console string in any doc here was written from
  memory — every one is marked "to capture" until it is.**
- The diagnostic checklist the article opens with is drafted in `docs/diagnostic-checklist.md`.

## Safety

`/unsafe/reflect-origin` (origin reflection with credentials — the anti-pattern) is not registered unless
`UNSAFE_REFLECT_ORIGIN=1`, and never in a default deploy.
