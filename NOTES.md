# Notes

## Why Vite + React + TypeScript

The app runs only in the browser and talks to an API I don't control, so server-side rendering wasn't needed. Vite gives a fast dev server and a simple build. I picked TypeScript because API data is untrusted and should be checked before the UI uses it. TanStack Query handles retries, request cancellation and infinite pagination. React Router keeps the filters and selected event in the URL, so a view can be shared as a link.

## What I built

I built an event viewer for browsing and investigating more than 50,000 events. It supports search, filters, a shareable detail panel and browser navigation. I also added virtual scrolling so only the visible rows are rendered.

Beyond the core requirements, I added keyboard navigation, dark mode, reduced-motion support and live mode. New events appear automatically when the user is at the top of the list. If they're reading older events, updates wait behind a “new events” pill instead of shifting the content. I also added a JSON tree viewer, a resizable detail panel and a time-range filter.

I added an events-over-time chart from `/events/histogram`. It follows the current search and filters, and clicking or dragging on it sets the time range, so the list, URL and Back button stay in sync. The API leaves out empty buckets, so I fill them with zeros to keep the time axis even. In the detail panel, a Formatted view shows arguments and results as plain labels and values for people who don't read JSON, with JSON one click away.

## Trade-offs and what I'd improve

The main challenge was handling live updates without disrupting the user's current position. The “new events” pill was added for this reason, so users can decide when to see new events instead of losing their place. AI suggested this approach, and it seemed like a better fit for the use case. I tested the behavior and checked the performance impact in DevTools.

If the stream disconnects, some events might be missed, so the app fetches the latest events again after reconnecting and merges them with the existing data.

I avoided automatically refetching every loaded page because the API can fail and repeated requests would add unnecessary work. With more time, I'd improve error handling and add automated browser tests to the repository for scrolling, live updates and accessibility.

## Known issues

The accessibility scan still reports issues with the copy buttons' accessible names and a page landmark. A timeout during a large response can show a JSON parsing error instead of a timeout message. Timestamp validation could also be stricter because I currently check that the value is a string rather than verifying that it's a valid date. The chart's range selection works with mouse and touch only (keyboard users use the Time filter), and the chart doesn't update in live mode.

## Beyond the brief (`additions` branch)

The submission is on `main`. After finishing it, I kept going on a separate branch, `additions`, so the main work stays exactly as asked.

My thought: someone responsible for these agents first wants to see the whole picture at once, and only then dig into single events. The list answers "what happened in this call?", but not "is something wrong right now, since when, and which agent?". So I added an **Overview** tab next to **Events**:

- Health cards: how many events, and what share were errors, blocked or OK, compared with the period before (for example "errors up 1.2 points vs the previous 6 hours").
- The chart split by status, so you can see when errors started.
- A table of agents, most errors first, so the agent causing trouble stands out.
- Every card and row opens the Events list with exactly those filters, so you go from the big picture to the single event in one click.

Both tabs share the same search and filters in the URL. I only show numbers the API can really give: there is no tool, policy or latency summary in the API, so I didn't fake one. To try it: `git switch additions`, then run the app as usual and open `/overview`.

One honest limit: the agent table is slow to fill. As a user, the Overview is great for a quick look at everything at once, but you will see the agent rows load one by one over a few seconds. That's because the API can't count per agent in one call, so the page has to ask once for each agent's events and once for its errors (about 24 calls for 12 agents). To keep it usable, the cards and chart load first, the agent requests go 4 at a time, each row appears as soon as its data arrives, and old numbers stay on screen (marked "updating") while new ones load. This is fine for 12 agents, but with hundreds of agents it would be too slow, the real fix would be an API endpoint that returns the totals for all agents in one call.

## How I used AI

How I worked, step by step:

1. Understood the problem and what the brief was really asking for.
2. Checked the API myself and tested every endpoint in a Postman collection (`docs/postman/`).
3. Shared the whole problem with Claude in plan mode, reviewed the plan, changed parts of it, then accepted it.
4. Designed the screens and states as a design artifact (`docs/Agent Activity Explorer Design.pdf`), then changed the design after more thoughts.
5. Developed with Claude under the rules in `CLAUDE.md`.
6. Added tests.

I used Claude Code throughout the project. It wrote most of the code and tests based on my plan and decisions. I added project rules in `CLAUDE.md`, including strict TypeScript, using a single API client and keeping the URL as the source of truth. I also documented notable mistakes and fixes in `docs/AI_LOG.md`. AI-assisted commits include a Co-Authored-By line.

I tested the generated code rather than assuming it was correct. For example, I removed a `content-visibility` optimization after measuring worse scrolling performance. I also corrected an inaccurate statement in the first draft of `PERF.md` about how the performance numbers were checked.

Testing exposed issues with keyboard focus and tooltips, while browser tests helped catch bugs in live mode, including new events disappearing when another page loaded.

Overall, AI helped speed up implementation, but the final behavior and performance still needed to be tested and verified.