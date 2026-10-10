// Endpoint functions. Each takes an AbortSignal so cancelled queries cancel their request.
import { apiGet } from './client'
import { isEventDetail, isEventsPage, isStringArray } from './guards'
import type { EventDetail, EventFilters, EventsPage } from './types'

/** Rows per request. The API caps `limit` at 200; 100 balances round trips against payload size. */
export const PAGE_SIZE = 100

/** Filters → API query params. Agents are repeated params (`agent=a&agent=b`, OR semantics). */
export function filtersToApiParams(filters: EventFilters): URLSearchParams {
  const params = new URLSearchParams()
  const q = filters.q.trim()
  if (q) params.set('q', q)
  for (const agent of filters.agents) params.append('agent', agent)
  if (filters.status) params.set('status', filters.status)
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

export function fetchEvent(id: string, signal?: AbortSignal): Promise<EventDetail> {
  return apiGet(`/events/${encodeURIComponent(id)}`, isEventDetail, { signal })
}

export function fetchAgents(signal?: AbortSignal): Promise<string[]> {
  return apiGet('/agents', isStringArray, { signal })
}
