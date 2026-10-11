// Endpoint functions. Each takes an AbortSignal so cancelled queries cancel their request.
import { apiGet } from './client'
import { isEventDetail, isEventsPage, isHistogram, isStringArray } from './guards'
import type {
  EventDetail,
  EventFilters,
  EventsPage,
  EventSummary,
  Histogram,
  HistogramBucketSize,
} from './types'

/** Rows per request. The API caps `limit` at 200; 100 balances round trips against payload size. */
export const PAGE_SIZE = 100

/** Filters → API query params. Agents are repeated params (`agent=a&agent=b`, OR semantics). */
export function filtersToApiParams(filters: EventFilters): URLSearchParams {
  const params = new URLSearchParams()
  const q = filters.q.trim()
  if (q) params.set('q', q)
  for (const agent of filters.agents) params.append('agent', agent)
  if (filters.status) params.set('status', filters.status)
  // Same names and semantics as the API: inclusive `from`, exclusive `to`.
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  return params
}

export function fetchEventsPage(
  filters: EventFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<EventsPage> {
  const params = filtersToApiParams(filters)
  params.set('limit', String(PAGE_SIZE))
  if (cursor) params.set('cursor', cursor)
  return apiGet('/events', isEventsPage, { params, signal })
}

/**
 * The newest event overall (unfiltered), or null when there are none. The list is newest first,
 * so this is one row of the first page. Quick time ranges count back from it: the data is
 * historical, so "the last hour" by the wall clock would usually be empty.
 */
export async function fetchNewestEvent(signal?: AbortSignal): Promise<EventSummary | null> {
  const params = new URLSearchParams({ limit: '1' })
  const page = await apiGet('/events', isEventsPage, { params, signal })
  return page.items[0] ?? null
}

export function fetchEvent(id: string, signal?: AbortSignal): Promise<EventDetail> {
  return apiGet(`/events/${encodeURIComponent(id)}`, isEventDetail, { signal })
}

export function fetchAgents(signal?: AbortSignal): Promise<string[]> {
  return apiGet('/agents', isStringArray, { signal })
}

/** Event counts per time bucket, for the same filters as the list. */
export function fetchHistogram(
  filters: EventFilters,
  bucket: HistogramBucketSize,
  signal?: AbortSignal,
): Promise<Histogram> {
  const params = filtersToApiParams(filters)
  params.set('bucket', bucket)
  return apiGet('/events/histogram', isHistogram, { params, signal })
}
