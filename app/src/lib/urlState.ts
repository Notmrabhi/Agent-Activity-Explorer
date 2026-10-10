// URL <-> explorer state. Pure functions so the round trip can be unit tested.
//
// Schema: ?q=<text>&agent=<name>&agent=<name>&status=ok|blocked|error&from=<iso>&to=<iso>&event=<id>
// Unknown or invalid values are dropped rather than trusted (a hand-edited or stale link must
// still open a sensible view).
//
// Time ranges are stored as ABSOLUTE timestamps, even when picked from a quick preset like
// "Last hour". A copied link is often evidence ("these are the calls that were blocked"), so it
// must reproduce exactly the same events tomorrow; a relative `range=1h` would slide forward as
// new data arrives and silently show a different set.
import { isEventStatus } from '../api/guards'
import { EMPTY_FILTERS, type EventFilters } from '../api/types'
import { normalizeTimestamp } from './timeRange'

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
  const from = normalizeTimestamp(params.get('from'))
  let to = normalizeTimestamp(params.get('to'))
  // An empty or inverted range can match nothing (`to` is exclusive). Keep the start, which is
  // the more deliberate half of a range, and drop the end rather than show a guaranteed-empty list.
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

/**
 * Canonical order (q, agent…, status, from, to, event) and no empty params, so equal views get
 * equal URLs. Times are written as given; callers pass canonical ISO (parse normalises on read).
 */
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
