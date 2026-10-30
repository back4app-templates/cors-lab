# Capture plan — Phase A browser captures (coordinator executes with the real, pinned browser)

Everything below that quotes a console line says **to capture**: no console text in this repo was written
from memory, and none may be. The lab page itself never predicts console text either — it prints only what
the `fetch` promise saw and what the server logged.

## 0. Session preamble (record once per capture session, before R0)

1. `npm run cert` (once) · `npm run dev` — all five pieces up (map in README).
2. Record: date/time, OS, browser **full version** (chrome://version — copy the whole version line),
   third-party-cookie setting (chrome://settings/cookies — name the selected option verbatim),
   and whether any flags/policies differ from defaults.
3. Open DevTools → Network: enable the **Method**, **Status**, **Type** columns; check "Preserve log".
   For every row record BOTH the preflight line (if any) and the main-request line; the displayed status
   is one of: a real HTTP status, `CORS error`, `(failed)`/status 0 — record it verbatim per line.
4. **R0 first, same session** (house rule): both R0 rows must succeed before any failure is captured.
5. Per row, save into `docs/evidence/matrix-<date>/`:
   `R<n>-console.txt` (right-click console → copy, verbatim), `R<n>.har` (export HAR),
   `R<n>-comparison.txt` (the matching wire row from `wire-matrix-local-<date>.md`, or a fresh
   `curl -i` transcript — **labeled comparison request**), `R<n>-console.png`, `R<n>-network.png`,
   and the **server-log line(s)** for the row's cid (the page shows them; also in api stdout).

## 1. Main matrix (page: http://localhost:1346, one button per row)

Every button prints the cid; the "What the server logged" cell distinguishes the two outcomes to record
per row (amendment B3): **preflight-blocked (no main request executed)** vs **ran-but-unreadable**.

| Row | Button / action | Record from network tab | Console text | Executed? (from server log) |
|---|---|---|---|---|
| R0-simple | `run-R0-simple` | main GET: real status 200 | expect none — capture if any | ran (control) |
| R0-preflight | `run-R0-preflight` | OPTIONS line + POST line, both statuses | expect none — capture if any | ran (control) |
| R2-simple-POST | `run-R2-simple-POST` | main POST displayed status vs the wire 200 | **to capture** | **RAN** — counter moved; body hidden |
| R2-preflight | `run-R2-preflight` | OPTIONS line status; is a POST line even shown? | **to capture** | **NOT RUN** — preflight blocked |
| R3a / R3b / R3c | each button | main GET displayed status vs wire 200 | **to capture** (one per cell — the message may name the mismatched value) | RAN, unreadable |
| R4a (cells — §2) | `run-R4a-samesite` / `run-R4a-crosssite` | main GET line; Cookies sub-tab of the request: was the cookie sent? | **to capture** per cell | RAN; `cookieArrived` per cell |
| R4b | `run-R4b` | OPTIONS line; main line present? | **to capture** | NOT RUN — preflight blocked |
| R4-fix / R4-fix-crosssite | buttons | 200; body rendered; cookie sent? | expect none — capture if any | RAN, readable |
| R5 | `run-R5` | OPTIONS **204 as HTTP** + how the tab displays the failure | **to capture** | NOT RUN |
| R5-fix | `run-R5-fix` | 200 | expect none | RAN |
| R6a | `run-R6a` | OPTIONS → 301 display | **to capture** | NOT RUN (main never sent) |
| R6b | `run-R6b` | both hops' displayed statuses | **to capture** | RAN (both hops) |
| R7-ok | `run-R7-ok` | 200 (control) | expect none | RAN |
| R7-boom | `run-R7-boom` | displayed status for the 500 — the misleading case | **to capture** | **RAN and crashed** — the console will say CORS; the log says 500 |
| R8 | open **http://localhost:5173** and click `run-R8` | main GET display | **to capture** | RAN, unreadable |
| R11 | `run-R11-no-cors-mode` | main line: status/type with `mode:'no-cors'` | **to capture — expected: silence; that silence is the finding** | RAN; page shows `type: opaque`, status 0 |
| R12 | `run-R12` | main GET display | **to capture** (distinct duplicate-header message) | RAN, unreadable |
| R13 | on :1346 click `run-R13-no-vary` (warm), then on **:5173** click the same button | X-Lab-Cache header per response (wire), displayed status on :5173 | **to capture** on the second origin | first origin RAN at the API; second was served by the cache — API never saw it |
| R13-fix | same two-origin sequence with `run-R13-with-vary` | both succeed | expect none | per-origin cache entries |
| CC-wildcard | `run-CC-wildcard` | 200 | expect none | RAN |
| CC-proxy-vs-direct | `run-CC-proxy-vs-direct` | two timed requests, same session (single observation, labeled exploratory) | expect none | both RAN |
| CC-reflect-origin | restart api with `UNSAFE_REFLECT_ORIGIN=1`, click `run-CC-reflect-origin` | 200 with credentials from a foreign-origin read | **to capture** | RAN — labeled "the thing not to ship" |

## 2. Cookie cells (amendment B2) — R4a / R4-fix per attribute × site relation

Precondition per cell: set the cookie **top-level** via the links at the top of the page (both API names),
then run the row's button. Record per cell: (a) whether the browser STORED the cookie (DevTools →
Application → Cookies for that host — `SameSite=None` without `Secure` may be rejected; record the
browser's own wording if shown), (b) whether the request SENT it (network tab → request Cookies),
(c) the console text, (d) `cookieArrived` from the server log. The third-party-cookie setting recorded in
§0 applies to every cell.

| Cell | Cookie | Page → API |
|---|---|---|
| C1 | unset | localhost:1346 → localhost:1345 (same-site) |
| C2 | SameSite=Lax | same-site |
| C3 | SameSite=None; Secure | same-site |
| C4 | SameSite=Lax | localhost:1346 → 127.0.0.1:1345 (**cross-site**) |
| C5 | SameSite=None; Secure | cross-site |
| C6 | SameSite=Strict | cross-site |
| C7 | SameSite=None (no Secure) | either — capture whether it is stored at all |

Run each cell against **R4a** (wildcard+credentials: the block) and once against **R4-fix** (the control:
does the readable response confirm the cookie reached the handler?). v1's claim "the cookie is not sent
even before the block" is NOT asserted — it is whatever these cells show.

## 3. R9′ — Local Network Access (amendment B1), page /lna.html

Per cell record FOUR things separately: permission state (the page prints `permissions.query` verbatim),
browser full version, `isSecureContext`, and the ordinary CORS outcome of the same request — plus whether
the relay's stdout shows the request id at all (absence = the browser never sent it). No fix is promised;
the deprecated PNA preflight headers are history, not guidance.

| Cell | Initiating page | Permission state |
|---|---|---|
| L1 | http://localhost:1346/lna.html | default (no prior decision) |
| L2 | http://localhost:1346/lna.html | after granting (if prompted) |
| L3 | https://localhost:1349/lna.html (secure context) | default |
| L4 | https://localhost:1349/lna.html | granted |
| L5 | https://localhost:1349/lna.html | denied |
| L6 | same as L3 with the `targetAddressSpace:'local'` button | default |
| L7–L9 | **LIVE PHASE**: the deployed https page (`https://<page>.b4a.run/lna.html`) → this machine's relay — the real public→local cells, per permission state | default / granted / denied |

Note for the write-up: a localhost page fetching a loopback relay may not be gated at all (local→local);
whatever happens IS the capture. The public-page cells (L7–L9) are the ones the article's section is
about and they are live-phase by nature.

## 4. Timing series (§6.1 / amendment B4) — page /timing.html

Three SEPARATE series; warm-ups never erase the cold cost. **Predefine the comparison margin before the
run** (proposal to confirm before running: p50 differences within ±2 ms on this loopback setup are
reported as "no observed difference"; the live run on Containers sets its own margin in the same way).
Baselines are same-session (amendment C1): the preflight series are compared only against the simple
series measured in the same run.

1. **simple** — click "Run simple": 20 warm-ups discarded + 100 timed; copy the JSON summary and the CSV.
2. **preflight-cached** — click "Run preflight-cached" (same URL every sample, `Access-Control-Max-Age:
   600`): 20 warm-ups + 100 timed; the summary includes the API counters before/after — report the count
   of OPTIONS requests the SERVER saw over the 100 timed calls (expected near the warm-up count only;
   report observed). No claim about the browser's max cache lifetime beyond this run window.
3. **cold** — per sample: launch a FRESH browser context
   (`chrome --user-data-dir=$(mktemp -d) 'http://localhost:1346/timing.html?series=cold&autorun=1'`),
   scrape `#result`, close. n=20 samples. **The 20-warm-up house rule is waived for this series** because
   it would erase exactly the cost under study; state the waiver in the evidence file.

Save as `docs/evidence/preflight-tax-<date>.csv` + a summary md naming sample counts, margin, and the
environment line.

## 5. Look-alike separation table (amendment B5) — one capture each

| Look-alike | Fixture | Capture |
|---|---|---|
| CORS block | R2-preflight | console + network tab (§1) |
| Cookie-policy failure | cell C4 or C5 (§2) against R4-fix — request succeeds as CORS, cookie missing | console (may be SILENT — record that) + request-cookies panel |
| Mixed content | https://localhost:1349/mixed.html → http target | **to capture** — note: loopback http may be exempt as potentially trustworthy; if so record THAT, and run the LAN-IP variant for the real cell (add that origin to ALLOWED_ORIGINS first so CORS is not the changed factor) |
| LNA permission | /lna.html (§3) | console + permission prompt screenshot |

## 6. R10 cross-browser sweep

Re-run R2 (both variants), R4a+R4b, R7-boom once each in Firefox and Safari (exact versions recorded).
One table of console-text differences — `docs/evidence/browsers-<date>.md`. Cut list if over budget:
Safari first (amendments, end note) — never a reproduction row.

## 7. Live phase only (NOT run from this repo in Phase A)

- **R1 / H1** — the managed REST API: browser `fetch` against `https://parseapi.back4app.com/...` with
  App ID + JS key headers from a deployed page; full preflight header set captured and dated
  (`rest-api-preflight-<date>.txt`). H1 decides the article's shape; first thing the live phase runs.
- Two Containers apps (page + API) — deploy shape in the build diary; allowlist via `ALLOWED_ORIGINS`
  env var (free-plan URLs rotate: sessions under an hour, prove every deploy with a request).
- L7–L9 LNA cells (public https page → local relay).
- The proxy counter-case latency pair re-measured page-on-platform (same-session direct baseline).
- Deploy facts (≈66 s first deploy etc.) are quoted with their 2026-10-08 date or re-measured, never
  assumed current.
