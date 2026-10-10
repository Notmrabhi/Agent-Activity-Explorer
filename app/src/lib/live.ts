// Live mode: which streamed events belong in the current view, and how they enter the cached list.
// Pure functions so the rules can be unit tested.
import type { InfiniteData } from '@tanstack/react-query'
import type { EventFilters, EventsPage, EventSummary } from '../api/types'

/**
 * Whether a streamed event matches the agent, status and time filters exactly.
 * Free-text search is not checked here: the server searches the full `args`, which streamed
 * events don't carry, so with a search active new events are offered as a refresh instead.
 */
export function matchesFilters(event: EventSummary, filters: EventFilters): boolean {
  if (filters.agents.length > 0 && !filters.agents.includes(event.agent)) return false
  if (filters.status !== null && event.status !== filters.status) return false
  const time = Date.parse(event.timestamp)
  if (filters.from !== null && time < Date.parse(filters.from)) return false
  if (filters.to !== null && time >= Date.parse(filters.to)) return false
  return true
}

/** True when streamed events can be merged into the list without asking the server. */
export function canMergeLocally(filters: EventFilters): boolean {
  return filters.q.trim() === ''
}

/**
 * Prepends new events to the first cached page, newest first, skipping ids already in it, and
 * raises the total by the number actually added. Later pages and cursors are untouched: the
 * keyset cursor points past the old first page, so nothing is fetched twice.
 */
export function prependEvents(
  data: InfiniteData<EventsPage, string | null> | undefined,
  events: EventSummary[],
): InfiniteData<EventsPage, string | null> | undefined {
  const first = data?.pages[0]
  if (!data || !first || events.length === 0) return data
  const known = new Set(first.items.map((item) => item.id))
  const fresh = events
    .filter((event) => !known.has(event.id))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  if (fresh.length === 0) return data
  return {
    ...data,
    pages: [{ ...first, items: [...fresh, ...first.items], total: first.total + fresh.length }, ...data.pages.slice(1)],
  }
}
