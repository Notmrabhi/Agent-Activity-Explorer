// URL <-> explorer state. Pure functions so the round trip can be unit tested.
//
// Schema: ?q=<text>&agent=<name>&agent=<name>&status=ok|blocked|error&event=<id>
// Unknown or invalid values are dropped rather than trusted (a hand-edited or stale link must
// still open a sensible view).
import { isEventStatus } from '../api/guards'
import { EMPTY_FILTERS, type EventFilters } from '../api/types'

export interface ExplorerUrlState {
  filters: EventFilters
  /** Event shown in the detail panel, or null when the panel is closed. */
  eventId: string | null
}

export const EMPTY_URL_STATE: ExplorerUrlState = { filters: EMPTY_FILTERS, eventId: null }

export function parseExplorerParams(params: URLSearchParams): ExplorerUrlState {
  const status = params.get('status')
  const agents = [...new Set(params.getAll('agent').map((a) => a.trim()).filter(Boolean))].sort()
  const eventId = params.get('event')?.trim() || null
  return {
    filters: {
      q: params.get('q') ?? '',
      agents,
      status: isEventStatus(status) ? status : null,
    },
    eventId,
  }
}

/** Canonical order (q, agent…, status, event) and no empty params, so equal views get equal URLs. */
export function serializeExplorerParams(state: ExplorerUrlState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.filters.q.trim()) params.set('q', state.filters.q)
  for (const agent of [...new Set(state.filters.agents)].sort()) params.append('agent', agent)
  if (state.filters.status) params.set('status', state.filters.status)
  if (state.eventId) params.set('event', state.eventId)
  return params
}

export function hasActiveFilters(filters: EventFilters): boolean {
  return filters.q.trim() !== '' || filters.agents.length > 0 || filters.status !== null
}
