# Perf Clinic: performance notes (Part B)

## How I measured

Chrome 154, 1440x900 viewport, fresh browser and empty cache for every run. Interactions and the load trace ran with 4x CPU throttling. Lighthouse used its own mobile and desktop presets. Every number is the median of 3 runs. I automated the runs with Playwright and the Chrome DevTools Protocol so they are repeatable. Each finding shows up in the DevTools panel named in its entry. A smoke check confirmed the page shows the same data and results before and after each fix.

## Summary

Ordered by how much a user feels it.

| # | Problem | Before | After |
|---|---|---|---|
| 1 | Blank screen on load | FCP 20,160 ms | FCP 1,396 ms |
| 2 | Typing in search freezes | slowest key 11,232 ms | slowest key 80 ms |
| 3 | Scrolling is janky | 18,980 ms in scroll handlers | 17.9 ms |
| 4 | Page unresponsive right after load | longest task 18,318 ms | 1,851 ms |
| 5 | Resize freezes (text fitting) | 5,686 forced layouts | 12 |
| 6 | Heavy hero image | 4.27 MB, mobile LCP 27.8 s | 208 KB, mobile LCP 2.0 s |
| 7 | Card height layout thrash | 4,319 ms | 0 ms |
| 8 | Wheel waits for JavaScript | 694 ms wheel delay | 70 ms |
| 9 | Hover tooltip lags | 29.6 ms per mousemove | 0.94 ms |
| 10 | Live ticker leaks | 5 intervals after close | 0 |
| 11 | localStorage write per row | 2,000 calls | 10 calls |
| 12 | Oversized, duplicate avatars | 1.94 MB | 6.8 KB |
| 13 | Unused theme.css | 333 KB CSS | 6 KB CSS |
| 14 | Marquee not composited | 93 layouts/s | 0 layouts/s |
| 15 | Font found late | requested at 1,634 ms | at 20 ms |
| 16 | Slow time formatting | 1,369 ms | 2.4 ms |
| 17 | Layout shift from my P1 fix | CLS 0.049 | CLS 0 |

## Problems

### 1. Blank screen for 20 seconds on load
- **Symptom:** The page stays white for about 20 seconds before anything shows.
- **How I found it:** Performance panel load recording at 4x CPU. `js/config.js` was render-blocking and its Evaluate Script took about 1 s, then `app.js` ran one 18 s task. The FCP marker sat at 20 s. Lighthouse listed `config.js` under render-blocking requests.
- **Root cause:** `config.js` was a blocking script in `<head>` that built all 100,000 events inline. `app.js` then rendered everything before the first paint.
- **Fix:** Both scripts are `defer`. `config.js` only defines `buildActivity` (same seed, same data). `app.js` builds the data and renders the list after the first frame.
- **Before / after:** First Contentful Paint 20,160 ms → 1,396 ms (in-browser trace, 4x CPU).

### 2. Typing in the search box freezes the page
- **Symptom:** Each key takes about a second to appear, and the first keys can hang for over 10 seconds.
- **How I found it:** Performance panel while typing "stripe" at 4x CPU. Every keypress was a long "Event: input" task. Bottom-Up showed the filter callback (`JSON.stringify` + `toLowerCase`) and the sort comparator (`new Date`) at the top.
- **Root cause:** On every key the input handler stringified all 100k events, sorted them with two `Date` objects per comparison, and re-rendered the list.
- **Fix:** Events are sorted once at startup. The lowercase JSON text of each event is cached and built in small 5 ms tasks after the first render. Input is debounced by 150 ms. Matches and order are unchanged.
- **Before / after:** Slowest keystroke 11,232 ms → 80 ms. Last key to results 874 ms → 347 ms.

### 3. Scrolling the list is janky
- **Symptom:** The list freezes for up to a second at a time while scrolling with the wheel.
- **How I found it:** Performance panel recording of wheel scrolling at 4x CPU. Each "Event: scroll" task ran about 540 ms in `onScroll`, with forced layouts from `getBoundingClientRect` on every row and an `Array.filter` over all events. The Frames track showed 110 dropped frames.
- **Root cause:** `onScroll` ran on every scroll event. It toggled `.in-focus` on all 200 rows and read `getBoundingClientRect` after each write. It also counted calls in the focused minute by filtering all 100k events.
- **Fix:** The work runs once per frame in `requestAnimationFrame`, reads before writes. Row offsets are measured once per render or resize. Calls per minute are counted once into a Map. Only rows that change are toggled. The progress bar uses `transform: scaleX`.
- **Before / after:** Scroll handler time 18,980 ms → 17.9 ms for 40 wheel steps. Dropped frames 110 → 43. TBT 19,238 ms → 152 ms.

### 4. Page does not respond right after load
- **Symptom:** Clicks and typing do nothing for a long time after the page appears.
- **How I found it:** Performance panel load trace. One long task (red corner) covered the data build and first render, 18.3 s at 4x CPU.
- **Root cause:** The data build, the sort, the per-minute counts and the first render (with `fitSummaries` layouts) all ran in one task.
- **Fix:** Covered by fixes 1, 2 and 5: the work moved after first paint, and the sort and text fitting got cheap. The data build itself is still one task after first paint.
- **Before / after:** Longest task 18,318 ms → 1,851 ms. Total blocking time during load 46,234 ms → 4,377 ms.

### 5. Resizing the window freezes the page
- **Symptom:** First render, each search and each window resize freeze for seconds.
- **How I found it:** Performance panel during a window resize. `fitSummaries` produced thousands of forced Layout events, each from reading `scrollWidth` right after setting `fontSize`.
- **Root cause:** For each of 200 cells it set the font size and read `scrollWidth`/`clientWidth` right away, up to 7 times. That is a forced layout per step per cell.
- **Fix:** Batched: write all cells, then read all cells, per pass, starting from a proportional guess. Resize refits at most once per frame. Final sizes are the same.
- **Before / after:** Forced layouts over 4 resizes 5,686 → 12. TBT 7,845 ms → 758 ms.

### 6. Hero image is 4.2 MB
- **Symptom:** On a phone the big hero image shows up very late.
- **How I found it:** Network panel, Img filter sorted by size: `hero.png` was 4.2 MB for a 1376x769 slot. Lighthouse flagged image delivery and gave mobile LCP 27.8 s.
- **Root cause:** A lossless 1700x950 PNG for a photo-like image, the same file for every screen size, with no width/height.
- **Fix:** `<picture>` with AVIF and WebP at 960w and 1700w (`srcset` + `sizes`) and a JPEG fallback. Added width/height and `fetchpriority="high"`.
- **Before / after:** Hero bytes 4,271,130 → 207,629. Lighthouse mobile LCP 27,758 ms → 1,964 ms.

### 7. Agent cards cause layout thrash
- **Symptom:** Load and resize stall while the agent cards jump to equal heights.
- **How I found it:** Performance panel: `equalizeCardHeights` ran 24 times during load (once per image load) with 576 forced layouts flagged "Forced reflow".
- **Root cause:** For every card it cleared the height and then read `offsetTop`/`offsetHeight` of all 24 cards, mixing writes and reads. It ran on every image load and resize.
- **Fix:** CSS grid handles it. `align-items: stretch` gives equal heights and `min-height: 220px` keeps the minimum. The JS and its listeners are removed.
- **Before / after:** Time in `equalizeCardHeights` during load 4,319 ms (576 forced layouts) → 0 ms.

### 8. Wheel scroll waits for JavaScript
- **Symptom:** The list does not move until the main thread is free.
- **How I found it:** Performance panel showed wheel events queued on the main thread. Lighthouse flagged non-passive listeners. `getEventListeners(#results)` in the Console showed `passive: false`.
- **Root cause:** `wheel` and `touchstart` on `#results`, and `scroll` on window, were added without `{ passive: true }`, so scrolling had to wait for JS.
- **Fix:** Registered them as passive.
- **Before / after:** Median wheel delay 694 ms → 70 ms.

### 9. Hover tooltip lags behind the mouse
- **Symptom:** Moving the mouse over the rows stutters and the preview trails the cursor.
- **How I found it:** Performance panel while moving over rows. Each "Event: mousemove" ran `showPreview` with an `Array.find` over all events, about 30 ms each at 4x CPU. 106 dropped frames.
- **Root cause:** `showPreview` searched 100k events by id on every mousemove and moved the tooltip with `top`/`left`.
- **Fix:** A Map by id built once. Text is only rewritten when the row changes. The tooltip moves with `transform`.
- **Before / after:** Average mousemove handler 29.6 ms → 0.94 ms. Dropped frames 106 → 1.

### 10. Live ticker leaks after closing
- **Symptom:** After opening and closing the ticker a few times, the page keeps working in the background and memory grows.
- **How I found it:** Memory panel heap snapshots before and after 5 open/close cycles showed detached `<li>` nodes kept by `renderedTickerRows`. Performance monitor showed DOM nodes climbing.
- **Root cause:** `closeTicker` removed the panel but never cleared the interval or removed the resize/keydown listeners. Every row ever shown stayed in a Map.
- **Fix:** Clear the interval and remove listeners (AbortController) on close. Dropped the row cache.
- **Before / after:** Intervals still running after 5 cycles 5 → 0. DOM node growth 1,611 → 15.

### 11. localStorage written once per row
- **Symptom:** Every render and search blocks on storage writes.
- **How I found it:** Performance panel Bottom-Up during searches showed `setItem` and `JSON.stringify` inside `rememberViewed`. Counting `setItem` calls gave 200 per render.
- **Root cause:** `rememberViewed` called `localStorage.setItem` inside the per-row loop, and `loadViewed` re-parsed the list every render.
- **Fix:** A Set loaded once, one `setItem` per render only when something changed, list capped at 5,000 ids.
- **Before / after:** 10 searches: 2,000 `setItem` calls (999 ms) → 10 calls (7 ms).

### 12. Oversized and duplicate avatars
- **Symptom:** Card images load slowly on mobile.
- **How I found it:** Network panel: 12 PNGs of about 160 KB each. Hovering in Elements showed 320x320 images drawn at 48x48. Hashing the files showed 07-12 were identical to 01-06.
- **Root cause:** 320 px PNGs used at 48 px, and six byte-identical copies under different names.
- **Fix:** Six 96 px WebP files (2x density) reused for all cards, with width/height.
- **Before / after:** Avatar bytes 1,937,110 (968,555 duplicate) → 6,792 (0 duplicate).

### 13. Unused, render-blocking theme.css
- **Symptom:** First paint waits for a stylesheet the page does not use.
- **How I found it:** Coverage tab: `css/theme.css` 100% unused. Lighthouse "Reduce unused CSS".
- **Root cause:** A utility-class stylesheet linked in `<head>` with none of its classes in use.
- **Fix:** Removed the `<link>` and the file.
- **Before / after:** Stylesheet bytes 332,635 → 6,167.

### 14. Alert marquee keeps the main thread busy
- **Symptom:** The page is busy even when idle, and scrolling competes with the alert strip.
- **How I found it:** Performance panel idle recording showed Layout and Paint every frame from the marquee. Rendering > Paint flashing lit up the strip. Lighthouse flagged a non-composited animation.
- **Root cause:** The keyframes animated `left`, which cannot run on the compositor.
- **Fix:** Animate `transform: translateX` with the same distances, and pause it for `prefers-reduced-motion`.
- **Before / after:** 93.1 layouts/s → 0 layouts/s while idle (now runs on the compositor).

### 15. Web font found late
- **Symptom:** Text stays invisible until the font arrives.
- **How I found it:** Network panel waterfall: `ibm-plex-sans.woff2` was requested only after CSS parse and layout. Lighthouse font-display check.
- **Root cause:** The font is only discovered when text is laid out, and the default `font-display` hides text.
- **Fix:** `<link rel="preload" as="font" crossorigin>` and `font-display: swap`.
- **Before / after:** Font request start 1,634 ms → 20 ms.

### 16. Slow timestamp formatting
- **Symptom:** Rendering rows spends visible time on timestamps.
- **How I found it:** Performance panel Bottom-Up: `formatTime` had 1,914 ms self time over 10 searches.
- **Root cause:** `toLocaleTimeString` with options builds an Intl formatter on every call, 200 times per render.
- **Fix:** Timestamps are UTC ISO strings, so `iso.slice(11, 19)` gives the same HH:MM:SS. Output checked identical for all 2,000 inputs.
- **Before / after:** 2,000 calls at 4x CPU 1,369 ms → 2.4 ms.

### 17. Layout shift after deferring the render
- **Symptom:** On a phone the "Recent tool calls" section jumped down when the cards appeared. My fix for problem 1 caused this.
- **How I found it:** Lighthouse mobile: CLS 0.049, "Avoid large layout shifts" pointed at the section.
- **Root cause:** With the render deferred, the agent grid was empty at first layout, so the section below moved when cards arrived.
- **Fix:** The empty grid reserves the space. Cards render as soon as `app.js` runs; counts fill in after the data build.
- **Before / after:** Mobile CLS 0 (original) / 0.049 (after fix 1) → 0.

## Trade-offs

- Lighthouse Total Blocking Time went up (desktop 0 → 136 ms, mobile 151 → 911 ms) even though the page feels far faster. The data build moved from before first paint into the window Lighthouse counts. Scores still rose: desktop 68 → 98, mobile 61 → 78. Next step would be building the data in a Web Worker.
- JS heap is about 61 MB instead of 29 MB. Most of it is the cached search text for 100k events. I traded memory for typing speed; a smaller index (only the fields people search) would cut it, but would change which queries match.

## Also noticed (left as is)

- The scroll highlight marks 5-6 rows at once because the focus band is 30-60% of the viewport. I kept it so before and after compare the same behaviour. Highlighting only the row nearest the centre would be clearer.
- The dev server sends no cache headers. The server lives outside `perf-clinic/`, so I did not touch it.
- Search matches JSON key names, so "ok" or "latency" match every event. It is a correctness quirk, and I kept it so results stay identical.
