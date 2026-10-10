import type { InfiniteData } from '@tanstack/react-query'
import type { EventFilters, EventsPage, EventSummary } from '../api/types'

export type ListData = InfiniteData<EventsPage, string | null>

/** Search isn't checked: the server searches full `args`, which streamed events don't carry. */
export function matchesFilters(event: EventSummary, filters: EventFilters): boolean {
  if (filters.agents.length > 0 && !filters.agents.includes(event.agent)) return false
  if (filters.status !== null && event.status !== filters.status) return false
  const time = Date.parse(event.timestamp)
  if (Number.isNaN(time)) return false
  if (filters.from !== null && time < Date.parse(filters.from)) return false
  if (filters.to !== null && time >= Date.parse(filters.to)) return false
  return true
}

export function canMergeLocally(filters: EventFilters): boolean {
  return filters.q.trim() === ''
}

const newestFirst = (a: EventSummary, b: EventSummary) =>
  Date.parse(b.timestamp) - Date.parse(a.timestamp)

/** Not in the first page, and not older than its last row when more pages follow (pagination brings those). */
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

/** Merges into the first page in time order. Later pages are untouched: the cursor points past page 1. */
export function prependEvents(
  data: ListData | undefined,
  events: EventSummary[],
): ListData | undefined {
  const first = data?.pages[0]
  if (!data || !first) return data
  const fresh = unseenEvents(data, events)
  if (fresh.length === 0) return data
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

/** A full fresh page that is entirely newer than `newest`: events may be missing in between. */
export function hasGap(newest: EventSummary | undefined, head: EventsPage): boolean {
  const oldest = head.items.at(-1)
  if (head.nextCursor === null || !oldest) return false
  if (!newest) return true
  if (head.items.some((item) => item.id === newest.id)) return false
  return Date.parse(oldest.timestamp) > Date.parse(newest.timestamp)
}
