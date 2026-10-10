// Live mode: which streamed events belong in the current view, and how they enter the cached list.
// Pure functions so the rules can be unit tested.
import type { InfiniteData } from '@tanstack/react-query'
import type { EventFilters, EventsPage, EventSummary } from '../api/types'

export type ListData = InfiniteData<EventsPage, string | null>

/**
 * Whether a streamed event matches the agent, status and time filters exactly.
 * Free-text search is not checked here: the server searches the full `args`, which streamed
 * events don't carry, so with a search active the server is asked instead.
 * Events with an unreadable timestamp never match.
 */
export function matchesFilters(event: EventSummary, filters: EventFilters): boolean {
  if (filters.agents.length > 0 && !filters.agents.includes(event.agent)) return false
  if (filters.status !== null && event.status !== filters.status) return false
  const time = Date.parse(event.timestamp)
  if (Number.isNaN(time)) return false
  if (filters.from !== null && time < Date.parse(filters.from)) return false
  if (filters.to !== null && time >= Date.parse(filters.to)) return false
  return true
}

/** True when streamed events can be matched locally, without asking the server. */
export function canMergeLocally(filters: EventFilters): boolean {
  return filters.q.trim() === ''
}

const newestFirst = (a: EventSummary, b: EventSummary) =>
  Date.parse(b.timestamp) - Date.parse(a.timestamp)

/**
 * The events that would be new in the list: not already in the first page, and not older than
 * its last row when more pages follow (those arrive through pagination, so adding them here
 * would show them twice). Deduplicated, newest first.
 */
export function unseenEvents(data: ListData | undefined, events: EventSummary[]): EventSummary[] {
  const first = data?.pages[0]
  const seen = new Set(first?.items.map((item) => item.id))
  const last = first?.items.at(-1)
  const oldest = first?.nextCursor != null && last ? Date.parse(last.timestamp) : -Infinity
  const fresh: EventSummary[] = []
  for (const event of events) {
    if (seen.has(event.id) || Date.parse(event.timestamp) < oldest) continue
    seen.add(event.id)
    fresh.push(event)
  }
  return fresh.sort(newestFirst)
}

/**
 * Merges new events into the first cached page in timestamp order (newest first), skipping ids
 * already in it, and raises the total by the number actually added. Later pages and cursors are
 * untouched: the keyset cursor points past the old first page, so nothing is fetched twice.
 */
export function prependEvents(
  data: ListData | undefined,
  events: EventSummary[],
): ListData | undefined {
  const first = data?.pages[0]
  if (!data || !first) return data
  const fresh = unseenEvents(data, events)
  if (fresh.length === 0) return data
  // Both lists are newest first: merge them, stopping as soon as the new events are placed
  // (they are almost always newer than everything cached).
  const items: EventSummary[] = []
  let index = 0
  for (const event of fresh) {
    const time = Date.parse(event.timestamp)
    for (
      let row = first.items[index];
      row && Date.parse(row.timestamp) > time;
      row = first.items[++index]
    ) {
      items.push(row)
    }
    items.push(event)
  }
  items.push(...first.items.slice(index))
  return {
    ...data,
    pages: [{ ...first, items, total: first.total + fresh.length }, ...data.pages.slice(1)],
  }
}

/**
 * True when a freshly fetched first page doesn't reach back to `newest`, the newest cached event
 * when the fetch started: the page is full and everything in it is newer, so events may be
 * missing in between and the list must be reloaded. (Overlap with events the stream delivered
 * meanwhile proves nothing: they are newer than the hole.)
 */
export function hasGap(newest: EventSummary | undefined, head: EventsPage): boolean {
  const oldest = head.items.at(-1)
  if (head.nextCursor === null || !oldest) return false
  if (!newest) return true
  if (head.items.some((item) => item.id === newest.id)) return false
  return Date.parse(oldest.timestamp) > Date.parse(newest.timestamp)
}
