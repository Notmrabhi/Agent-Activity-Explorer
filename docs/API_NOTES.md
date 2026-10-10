# Mock API: observed behaviour

Probed on 2026-10-10 with curl and a Node script before writing any data-layer code. The API is treated as a third-party service, so the client is designed around what it actually does, not just the docs.

## Reliability and latency
| Endpoint | Failure rate (sample) | Failure shape | Latency |
|---|---|---|---|
| `GET /events` | ~5–8% (21 of 271 calls in a full walk) | `500 {"error":"internal server error"}` | ~0.15–1.5 s, uniform-ish |
| `GET /events/:id` | ~6% (12 of 200) | same 500 body | usually < 20 ms |
| `GET /agents` | ~10% (2 of 20) | same 500 body | < 5 ms |

- Failures look random per request, so a **retry with backoff is the right response** for 5xx.
- No 429s or hangs observed in the sample. We still treat "slow" as a first-class state (DevTools throttling + real-world networks).

## Validation errors (do not retry)
- `status=bogus` → `400 {"error":"status must be one of ok, blocked, error"}`
- `cursor=garbage` → `400 {"error":"invalid cursor"}`
- `GET /events/evt_nope` → `404 {"error":"event not found"}`. The detail panel needs a "not found" state for stale links.

All error bodies share the shape `{ "error": string }`.

## Pagination
- `nextCursor` is base64 of `<timestampMs>|<id>`: **keyset pagination**, so pages stay stable and there are no duplicates or gaps (verified: 50,000 unique ids over 250 pages).
- Last page returns `nextCursor: null`.
- `limit` is silently capped at **200** (`limit=500` returns 200 items).
- `total` is constant (50,000 unfiltered) and reflects the filters (`q=zzzz` → `{"items":[],"nextCursor":null,"total":0}`).
- Order: newest first (`timestamp` desc). Data spans 2026-10-07 12:00Z → 2026-10-09 12:00Z.

## Data
- 12 agents, 15 tools. Status mix: ok 85%, error 8%, blocked 6.5%.
- `latencyMs` ranges 1 → **30,000** (formatting must handle seconds).
- `argsPreview` is a JSON string, max ~121 chars.
- `args` in detail is arbitrary JSON (objects seen; must handle any value). `result` and `policyMatches: string[]` present; ~6% of events have policy matches.
- Repeated `agent` params work (`agent=a&agent=b` = OR).
- CORS: `Access-Control-Allow-Origin` echoes the localhost origin.

## Design consequences
1. Retry 5xx / network errors (2 retries, exponential backoff). Never retry 4xx.
2. A failed *next page* must not wipe the rows already loaded: show an inline "couldn't load more · Retry" row.
3. The detail panel has distinct loading / error+retry / not-found states.
4. Agent filter failure must not break the page: show it as degraded with retry.
5. Use `limit=100` per page: fewer round trips than 50, and still fast to render.
