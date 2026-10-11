// Shapes returned by the mock API. See docs/API_NOTES.md for observed behaviour.

export const EVENT_STATUSES = ['ok', 'blocked', 'error'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

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

/** `args` and `result` are arbitrary JSON and may be large. */
export interface EventDetail {
  id: string
  timestamp: string
  agent: string
  tool: string
  status: EventStatus
  latencyMs: number
  args: unknown
  result: unknown
  policyMatches: string[]
}

export interface EventsPage {
  items: EventSummary[]
  /** Opaque keyset cursor; null on the last page. */
  nextCursor: string | null
  total: number
}

export interface EventFilters {
  q: string
  /** Kept sorted for stable cache keys. */
  agents: string[]
  /** null = all statuses. */
  status: EventStatus | null
  /** Inclusive, ISO UTC. */
  from: string | null
  /** Exclusive, ISO UTC. */
  to: string | null
}

export type TimeRange = Pick<EventFilters, 'from' | 'to'>

export type HistogramBucketSize = '1m' | '5m' | '1h'

export interface HistogramBucket {
  /** Bucket start, ISO UTC. */
  t: string
  count: number
}

/** GET /events/histogram. Empty buckets are left out. */
export interface Histogram {
  bucket: HistogramBucketSize
  buckets: HistogramBucket[]
}

export const EMPTY_FILTERS: EventFilters = { q: '', agents: [], status: null, from: null, to: null }
