# Build diary — cors-lab

## 2026-10-30 — Phase A built and green locally (29 tests, 21 wire rows, 0 failures)

Built against the amended brief (`brief-cors-errors-blog-post-v1.md` + `…-amendments.md`, amendments win).
Local only: Express 5.3.0 (installed offline from the npm cache — no network), Node 25.8.1. No Back4app
backend, no parseapi probe, no remote host touched; every reproduction runs between local servers.

**Decisions**

- **One factor per route**, enforced structurally: `/ok` is the positive control; every failing route is
  `/ok` with one named change (comment above each route + README table). The allowlist comes from
  `ALLOWED_ORIGINS`; the dev origin :5173 is deliberately absent from the default — that absence IS row R8.
- **Request ids and the executed-bit** (B3): a logging middleware assigns `req-NNNNN` to every request,
  preflight and main alike; only route code flips `handlerExecuted`. The page correlates via a `cid`
  QUERY PARAM — never a header, because a custom header would change the request's CORS classification.
  `GET /__state?cid=…` returns the log slice; the lab page prints "what the server logged" next to "what
  fetch saw" for every button, so preflight-blocked vs ran-but-unreadable is visible per click.
- **R4 split** (B2): R4a is a SIMPLE credentialed GET (reaches the server — counter and cookie names in
  the log prove it), R4b a preflighted credentialed POST (log shows the preflight only). Cookie attribute
  cells via `/r4/set-cookie?samesite=…&secure=1`, set top-level so the precondition doesn't depend on the
  third-party-cookie policy under test. Same-site vs cross-site WITHOUT extra servers: the API answers as
  `localhost:1345` (same site as the page) and `127.0.0.1:1345` (different site) — one server, two names.
- **Cached-preflight series** (B4): the preflight cache is keyed by the full URL, so the cached series
  must hit ONE identical URL — the per-sample cid had to go; OPTIONS counts come from `/__state` counters
  before/after instead. Cold series = one sample per fresh browser context, warm-up waiver stated in
  timing.html itself and in the capture plan.
- **Bad fixes** (B5): R11 reuses `/r2/no-cors` with `mode:'no-cors'` from the page (the silencer);
  R12 `res.append` twice → two raw `Access-Control-Allow-Origin` lines on the wire (asserted from
  rawHeaders, not the joined header map); R13 ships with its own naive shared-cache proxy (:1348) that
  honours `Vary: Origin` only when present — so one fixture shows both the leak and the fix.
- **R9′** (B1): the relay reproduces the 2026-10-29 helper (ACAO `*`, no OPTIONS handling, 127.0.0.1
  only) and logs every request id — under a denied LNA permission, the ABSENCE of a relay log line is the
  evidence. `/lna.html` records permission state (permissions.query printed verbatim, both candidate
  names), full browser version, isSecureContext, and the CORS outcome — four separate records, no fix
  promised anywhere.
- **Anti-pattern gating** (amendment-9 pattern): `/unsafe/reflect-origin` is not even registered unless
  `UNSAFE_REFLECT_ORIGIN=1`; tested both off (404) and on (any origin reflected with credentials).
- **Comparison-request language** everywhere: helpers, evidence generator and docs all label Node/curl
  requests as comparison requests, never as proof about a browser request.

**Findings while building**

- **Express 5 answers unhandled OPTIONS itself**: OPTIONS `/r2/no-cors` → **200 with `Allow: GET, HEAD,
  POST`** and no CORS headers — not the 404 the v1 brief guessed (v1 R2 "OPTIONS likely 404 … to
  capture"). Captured in the wire matrix; the article should quote 200+Allow.
- **Reading the log must not write to it**: the first run had `/__state?cid=X` logging ITSELF under cid X,
  inflating every per-cid count (caught by the R6a/R6b log-length assertions). Introspection paths are now
  excluded from the reproduction log.
- Node's `res.append` duplicate header really does emit two header lines (verified via `rawHeaders`);
  `fetch`'s joined view would have hidden that, which is why the R12 test uses the raw client.
- The R7 error path (`throw` after `executed()`) produces exactly the misleading shape: counter moves,
  log says `handler executed: true … status 500`, wire shows 500 with no ACAO.
- Self-signed cert for https://localhost:1349 via LibreSSL needs the SAN through a config file
  (`-addext` not relied on); `npm run cert`, gitignored.

**Capture/effort inventory (computed from the fixtures actually built — C4 restated)**

| Block | Cells |
|---|---|
| §1 main-matrix buttons (R0×2, R2×2, R3×3, R4b, R4-fix×2, R5+fix, R6×2, R7×2, R8, R11, R12, R13×2, CC×3) | 26 |
| §2 cookie cells (7 × R4a + 2 control runs on R4-fix) | 9 |
| §3 LNA local cells (L1–L6) | 6 |
| §5 mixed content (loopback + LAN-IP variant) | 1–2 |
| §6 R10 sweep (4 cases × Firefox, Safari) | 8 |
| Timing series (cold n=20 fresh contexts · cached 20+100 · simple 20+100) | 3 series |
| **Local browser captures total** | **~50 cells + 3 series** |
| Live phase (R1/H1 probe, L7–L9, proxy pair on-platform, deploy re-observations) | ~7 more |

That is above the amendments' 30–34 estimate because control/fix cells and all cookie cells are counted
individually. Cut list, in order, to get back to ~34 without losing a reproduction row: the Safari column
of R10 (−4, sanctioned first cut), cookie cells C6/C7 (−2), L6 (−1), the LAN-IP mixed variant (−1),
R4-fix control cells folded into their failure rows (−3). Effort restated: lab day spent today; captures
+ sweep ≈ 1 day at the full inventory (the ~3.75-day total holds only with the cut list applied or
captures allowed to run 1.25 days).

**Open questions for the coordinator**

1. Containers start command: the buildpack's auto-detect looks for a root `server.js` (house pattern);
   this repo has `api/server.mjs` + `page/server.mjs`. Set the Start Command explicitly per app, or should
   I add two one-line root wrappers / separate deploy branches?
2. Timing margin (C2): proposed ±2 ms p50 on loopback — confirm or replace BEFORE the runs; the live run
   needs its own predefined margin.
3. Mixed-content cell: loopback http is likely exempt (potentially trustworthy); is the LAN-IP variant
   wanted in scope, or do we record the exemption and keep the cell live-phase?
4. R13 on the platform: is a shared cache even in front of Containers responses? If not, R13 stays a
   local-only demonstration and the article says so.
5. The capture driver (`capture/` per v1 §4.1, CDP-driven) is not built yet — the amendments moved the
   captures to the coordinator; say the word if Phase A should still ship the script.
