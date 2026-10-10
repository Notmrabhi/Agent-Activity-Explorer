// ?q&agent&agent&status&from&to&event. Invalid values are dropped, not trusted.
// Time ranges are absolute, even from a preset: a shared link must show the same events tomorrow.
import { isEventStatus } from '../api/guards'
import { EMPTY_FILTERS, type EventFilters } from '../api/types'
import { normalizeTimestamp } from './timeRange'

export interface ExplorerUrlState {
  filters: EventFilters
  eventId: string | null
}

export const EMPTY_URL_STATE: ExplorerUrlState = { filters: EMPTY_FILTERS, eventId: null }

export function parseExplorerParams(params: URLSearchParams): ExplorerUrlState {
  const status = params.get('status')
  const agents = [
    ...new Set(
      params
        .getAll('agent')
        .map((a) => a.trim())
        .filter(Boolean),
    ),
  ].sort()
  const eventId = params.get('event')?.trim() || null
  const from = normalizeTimestamp(params.get('from'))
  let to = normalizeTimestamp(params.get('to'))
  // An inverted range matches nothing: keep the start, drop the end.
  if (from !== null && to !== null && Date.parse(from) >= Date.parse(to)) to = null
  return {
    filters: {
      q: params.get('q') ?? '',
      agents,
      status: isEventStatus(status) ? status : null,
      from,
      to,
    },
    eventId,
  }
}

/** Canonical order and no empty params, so equal views get equal URLs. */
export function serializeExplorerParams(state: ExplorerUrlState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.filters.q.trim()) params.set('q', state.filters.q)
  for (const agent of [...new Set(state.filters.agents)].sort()) params.append('agent', agent)
  if (state.filters.status) params.set('status', state.filters.status)
  if (state.filters.from) params.set('from', state.filters.from)
  if (state.filters.to) params.set('to', state.filters.to)
  if (state.eventId) params.set('event', state.eventId)
  return params
}

export function hasActiveFilters(filters: EventFilters): boolean {
  return (
    filters.q.trim() !== '' ||
    filters.agents.length > 0 ||
    filters.status !== null ||
    filters.from !== null ||
    filters.to !== null
  )
}
