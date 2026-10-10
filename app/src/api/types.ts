// Shapes returned by the mock API. See docs/API_NOTES.md for observed behaviour.

export const EVENT_STATUSES = ['ok', 'blocked', 'error'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

/** One row of GET /events. */
export interface EventSummary {
  id: string
  /** ISO 8601, UTC. */
  timestamp: string
  agent: string
  tool: string
  status: EventStatus
  latencyMs: number
  /** A JSON string, truncated by the API (~120 chars max). */
  argsPreview: string
}

/** GET /events/:id. `args` and `result` are arbitrary JSON and may be large. */
export interface EventDetail {
  id: string
  timestamp: string
  agent: string
  tool: string
  status: EventStatus
  latencyMs: number
  args: unknown
  result: unknown
  /** Names of policy rules that fired for this call. */
  policyMatches: string[]
}

export interface EventsPage {
  items: EventSummary[]
  /** Opaque keyset cursor; null on the last page. */
  nextCursor: string | null
  /** Total matching events for the current filters. */
  total: number
}

/** What the user can filter by. Mirrors the URL query string. */
export interface EventFilters {
  /** Free text over agent, tool and args. Empty string = no search. */
  q: string
  /** Selected agent names. Empty = all agents. Kept sorted for stable cache keys. */
  agents: string[]
  /** null = all statuses. */
  status: EventStatus | null
  /** Inclusive start, ISO 8601 UTC (e.g. "2026-10-09T11:00:00.000Z"). null = no lower bound. */
  from: string | null
  /** Exclusive end, ISO 8601 UTC. null = no upper bound. Always after `from` when both are set. */
  to: string | null
}

/** The time-range part of the filters. Either end may be open. */
export type TimeRange = Pick<EventFilters, 'from' | 'to'>

export const EMPTY_FILTERS: EventFilters = { q: '', agents: [], status: null, from: null, to: null }
