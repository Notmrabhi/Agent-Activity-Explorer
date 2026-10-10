# Design decisions

Design canvas (private until shared): https://claude.ai/artifact/H4p4yErdJG25kobeGtBDj9
It holds 6 artboards: Explorer light, Explorer dark, Tablet, State gallery, Tokens and the Shortcuts dialog. The tokens on the canvas are the same values as `app/src/styles/tokens.css`.

## Direction: "Control Room"
The user is an engineer or security reviewer scanning thousands of tool calls to find what failed or was blocked. So the UI is calm, dense and precise:
- Neutral greys, **one** accent (blue), and status colours that only appear where they carry meaning.
- **IBM Plex Sans** for UI text and **IBM Plex Mono** for data (times, IDs, tools, latency, JSON), so values line up and read as data. Fonts are self-hosted (`@fontsource`), with no third-party requests.
- Flat surfaces with 1px borders. The only shadow is on the detail panel, because it is the only layer.

## Layout
| Decision | Why |
|---|---|
| **Side panel, not a modal or a new page** | You keep your place in a 50k-row list while inspecting one event, and can step through events with J/K. Docked beside the list at ≥ 1200px; overlays the list (with a scrim, and focus contained) below that. |
| **Full-height app layout; only the list scrolls** | The header, filters and column headings stay visible. It also gives virtualisation one scroll container with a known height. |
| **Fixed 40px rows** | Required for arithmetic virtualisation (no measuring), and dense enough for scanning. Long values truncate with an ellipsis; the full value is in the panel. |
| **Times shown in UTC in the table** | A copied link must show the same view to everyone, including the same timestamps. The panel also shows the viewer's local time. |
| **Arguments preview column** | It's the fastest way to tell similar calls apart. It is dropped below 1024px, where the five required columns take priority. |
| **Infinite scroll, not page numbers** | The API is cursor-based (no random access to page N), so infinite scroll is the honest UI for it. "Showing N of TOTAL" makes progress clear, and the list ends with an explicit "End of results" row. |

## Jira-inspired patterns (interaction patterns, not Atlassian's look)
- **Filter buttons** (`Agent ▾ (2)`, `Status ▾`, Clear filters): one consistent control per dimension, showing the active count at a glance.
- **Panel header actions:** previous/next event, **Copy link** (proves the panel is linkable), close.
- **Agent avatars:** initials on a tint picked by a stable hash of the agent name. This makes visual scanning much faster, and the initials keep it from relying on colour alone.
- **Collapsible panel sections:** Details, Policy matches, Arguments, Result.
- **`?` opens a keyboard-shortcuts dialog** (`/` search, J/K or ↑/↓ move, Enter open, Esc close).

Deliberately **not** borrowed: column sorting, group-by and saved filters. The API doesn't support sorting or grouping, and faking them client-side over a partially loaded list would be wrong.

## States (every data view)
| View | Loading | Slow (> 2.5 s) | Empty | Error |
|---|---|---|---|---|
| Event list, first load | Skeleton rows | Amber notice + Retry / Cancel | "No events match" + which filters + Clear | Message + `HTTP 500 · …` detail + Try again |
| Event list, new filters | Old rows stay, dimmed, with a progress bar | Same notice | Same | Same; old rows are discarded only on success |
| Next page | "Loading more events…" row | Same notice | n/a ("End of results" row) | Inline "Couldn't load more · Retry" row; loaded rows kept |
| Detail panel | Skeleton (row summary shown instantly if the row is loaded) | Same notice | n/a | Not found (404) vs failed + Try again |
| Agent filter | Spinner in the popover | n/a | "No agents" | "Couldn't load agents · Retry"; search and status keep working |

## Accessibility
- Text contrast ≥ 4.5:1 and control outlines ≥ 3:1 in both themes. Ratios were **computed**, not estimated (see `tokens.css`). The first token draft had control borders at 1.62:1; computing the ratios caught it.
- Status = colour + icon + word. Agent avatar = colour + initials.
- Keyboard: every control is reachable; the list uses roving focus (one Tab stop, arrows inside); the focused row stays mounted even when scrolled out of the virtual window; closing the panel returns focus to the row that opened it.
- Dark mode follows `prefers-color-scheme`; motion is removed under `prefers-reduced-motion`.
