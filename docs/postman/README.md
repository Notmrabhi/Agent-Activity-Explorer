# Postman collection for the mock API

`agent-activity-api.postman_collection.json` covers every endpoint: 20 requests, each with a **saved example response captured from the real server** and tests.

## Use it
1. Start the API from the repo root: `npm run api` (http://localhost:4000).
2. In Postman: **Import** → select the JSON file.
3. Open any request and click **Send**, or open **Examples** on a request to see a real response without calling the server.
4. To run everything: right-click the collection → **Run collection**.

Collection variables: `baseUrl` (default `http://localhost:4000`), `eventId`, `nextCursor`.

## What's inside
| Folder | Requests |
|---|---|
| Agents | `GET /agents` |
| Events | First page, next page via cursor, search `q`, repeatable `agent`, `status`, `from`/`to` range, all filters combined, no results, `limit` above max |
| Events → Get event | `GET /events/{{eventId}}`: full `args`, `result`, `policyMatches` |
| Histogram | `bucket=1h`, `bucket=5m` with filters |
| Live stream (SSE) | `GET /stream`: stays open; recent Postman versions show messages live |
| Error cases | 404 unknown id, 400 bad status / cursor / `from` / bucket, and an example of the random 500 |

Run the **Events** folder top to bottom: "List events" saves `nextCursor` and `eventId`, which "Next page" and "Get event" then use.

## Things to notice (they shaped the app)
- **Random 500s:** about 5–10% of requests to any endpoint fail with `{"error":"internal server error"}`. Just send again. The app retries these automatically (twice, with backoff).
- **`limit` is capped at 200** silently; `limit=500` returns 200 items.
- **Cursor** is keyset pagination (base64 of `timestampMs|id`), so pages never overlap or skip.
- **All errors** share `{ "error": string }`. 4xx are never retried by the app.

Verified with Newman (Postman's CLI): 20 requests, 49 assertions, 0 failures.

The collection is regenerated from the live API by a small script (`postman-gen.mjs`, kept outside the repo); the examples are real responses, not hand-written.
