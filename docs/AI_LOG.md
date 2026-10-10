# AI usage log

**Tool:** Claude Code (Claude Opus) in VS Code, used as a pair programmer. I set direction and made the product decisions; AI drafted plans, probe scripts, mockups and code; everything was reviewed, run and tested before commit. The repo rules the AI had to follow are in `CLAUDE.md`.

This is a running log of **where AI output was wrong or needed a decision**, which is the useful part. Routine generation isn't listed.

| # | Area | What the AI produced | What was wrong / decided | Outcome |
|---|---|---|---|---|
| 1 | Planning | A full plan: Vite + React + TS, TanStack Query, hand-built virtualisation + tests, CSS Modules | I asked why TS over JS and why TanStack over RTK Query, and challenged the styling choice | Kept TS (the brief prefers it; it type-checks AI output) and TanStack (no client state needs Redux; it handles cursor pagination and aborts). Styling went to Bootstrap, then Tailwind (#6). |
| 2 | API | Probe scripts that walked all 50k events | The docs say nothing about the failure rate, the `limit` cap or the cursor format. Measured: ~5–10% random 500s on every endpoint, `limit` silently capped at 200, keyset cursor | Added an inline "couldn't load more" row, a 404 state for stale links, and retry only for 5xx/network. See `docs/API_NOTES.md`. |
| 3 | Design tokens | First token set: control borders `#C5CCD5` | Computing WCAG ratios showed **1.62:1**, failing 1.4.11 (non-text contrast ≥ 3:1) | Changed to `#848D9B` (3.35:1) light and `#646E7C` (3.42:1) dark. All ratios are now computed by a script, not eyeballed. |
| 4 | Mockup | The Explorer artboard showed the Agent filter as "2 selected" while the list showed all 12 agents and 50,000 events | An internally inconsistent mockup | Neutral filter state on the main artboard; the active state is shown on the Tablet artboard instead. |
| 5 | Scaffold | create-vite's tsconfig doesn't set `strict` explicitly | TS 6 defaults to strict, but implicit is fragile and invisible to reviewers | Explicit `strict` + `noUncheckedIndexedAccess`. |
| 6 | Styling | Bootstrap (layout-only, Sass partials, filtered utilities) | Measured build: **77 KB CSS**, because Bootstrap pre-generates every responsive utility | Switched to Tailwind v4 with tokens as the theme: **9 KB**. The default palette is removed, so off-token colours can't compile. |
| 7 | Data layer | Default `staleTime` for the infinite event list | Refetching a stale infinite query re-requests **every loaded page** in sequence: 100+ requests against an API that fails ~7% of the time | `staleTime: Infinity` for the list; data refreshes on reload or filter change. |
| 8 | Tokens | When re-typing tokens into code, `--error-bg` became `#fcf0ee` | It didn't match the design value `#fceae8` that the 5.04:1 ratio was computed against | Restored the design value. |
| 9 | Live mode | First version wrote streamed events straight into the infinite-query cache and trusted `/stream` to deliver every event | AI-written browser tests (Playwright, real Chrome) found: inserts wiped when an in-flight next page landed (TanStack writes back the pages it started from), holes after reconnects, late toggles and filter round trips, events lost during the first load, a pill count inflated by the replay, and a screen-reader count announced per event | Fixes AI-written, reviewed by me file by file before committing: never write the cache during a list fetch (hold, or cancel first); catch up from the first page on every connect and filter change; dedupe against the cache; merge in timestamp order; announce counts per result set only. Unit tests in `lib/live.test.ts`. |

<!-- Add your own review notes below: anything you questioned, rejected or rewrote yourself. -->
