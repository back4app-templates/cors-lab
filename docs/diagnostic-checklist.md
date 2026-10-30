# Diagnostic checklist (draft for the article's section 1 — amendment C3)

Drafted from the local wire matrix; every placeholder marked **to capture** is filled only from the
Phase A browser captures, never from memory. This is the section the reader came for, so it leads the
article; the evidence sections follow it.

## Step 1 — read the network tab, not the console

The console message is one line about many different failures. The network tab shows, per request line
(and the preflight OPTIONS is its own line), one of four states:

| Displayed | What it means | Lab row |
|---|---|---|
| a real HTTP status (200, 500, …) | the server ANSWERED; the browser may still refuse to let your code read it | R2-simple, R3a–c, R7-boom, R12 |
| `CORS error` (text **to capture** per pinned version) | the response arrived and failed a CORS check | R2, R3, R4, R5, R12 |
| `(failed)` / status 0 | the request or its preflight never completed | R6a, (others **to capture**) |
| nothing wrong at all, body unreadable (`type: opaque`, status 0 in code) | `mode:'no-cors'` silenced the failure | R11 |

## Step 2 — the four-way split: is it even CORS?

Four look-alikes, one capture each (capture plan §5):

1. **CORS block** — cross-origin response without (or with a mismatched) `Access-Control-Allow-Origin`.
2. **Cookie policy** — the request SUCCEEDS as CORS but the cookie was never stored or never sent
   (`SameSite`, third-party-cookie setting). Often silent. Check the request's Cookies panel, not the console.
3. **Mixed content** — https page calling an http URL. Different console wording (**to capture**).
4. **Local Network Access** — current Chrome gates public-page → local-address requests behind a
   permission; outcome per permission state (**to capture**, R9′).

## Step 3 — did the server execute the request? (logs first, always)

A CORS error in the console does **not** establish that the server never ran your request.

- A **simple** request (GET; POST with form/text content-type) is sent immediately: the server may have
  executed it — your POST may have written data — while the page saw only `TypeError` (**exact text to
  capture**). Lab proof: R2-simple-POST and R7-boom move the server-side counter.
- A **preflighted** request (JSON content-type, custom headers, …) is blocked BEFORE the main request if
  the OPTIONS answer is wrong: nothing executed. Lab proof: R2-preflight, R4b — the log shows only the
  preflight line.

So: read the server log (every lab route logs a request id) before deciding whether to retry a
non-idempotent call. A curl replay is a **comparison request** — it shows what the server answers to an
equivalent request, never what happened to the original browser request.

## Step 4 — map the console text to the cause

(Filled after the captures; each cell cites its row's capture file. Console strings are version-bound —
the pinned version is stated, and the R10 table absorbs cross-browser drift.)

| Console says (verbatim, **to capture**) | Likely cause | Row / fix |
|---|---|---|
| to capture | no `Access-Control-Allow-Origin` at all | R2 → set the header/middleware for the exact origin |
| to capture | allowlist value mismatch (scheme/port/trailing slash) | R3a–c → an origin is scheme+host+port, no path |
| to capture | wildcard with credentials | R4 → exact origin + `Allow-Credentials: true` |
| to capture | header not in `Access-Control-Allow-Headers` | R5 → list the header in the preflight answer |
| to capture | preflight answered with a redirect | R6a → answer OPTIONS directly |
| to capture | redirect target lacks headers | R6b → set headers on the target (or avoid the hop) |
| to capture | "CORS" hiding a 500 | R7 → fix the crash; set headers on error paths too (cors middleware does) |
| to capture | duplicate `Access-Control-Allow-Origin` | R12 → set it exactly once |
| to capture | stale per-origin response from a shared cache | R13 → `Vary: Origin` |
