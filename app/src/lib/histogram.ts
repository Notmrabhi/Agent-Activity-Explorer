import {
  EVENT_STATUSES,
  type EventFilters,
  type EventStatus,
  type HistogramBucket,
  type HistogramBucketSize,
} from '../api/types'

export const BUCKET_MS: Record<HistogramBucketSize, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
}

const HOUR_MS = 60 * 60_000

/** Finest bucket that keeps the chart under ~300 bars. Open-ended ranges use hours. */
export function chooseBucket(
  filters: Pick<EventFilters, 'from' | 'to'>,
  newestIso: string | null | undefined,
): HistogramBucketSize {
  if (filters.from === null) return '1h'
  const end = filters.to ?? newestIso
  if (!end) return '1h'
  const span = Date.parse(end) - Date.parse(filters.from)
  if (Number.isNaN(span)) return '1h'
  if (span <= 3 * HOUR_MS) return '1m'
  if (span <= 24 * HOUR_MS) return '5m'
  return '1h'
}

/** The API leaves out empty buckets; put them back as zeros so the time axis is even. */
export function fillGaps(buckets: readonly HistogramBucket[], bucketMs: number): HistogramBucket[] {
  const sorted = [...buckets].sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
  const first = sorted[0]
  const last = sorted.at(-1)
  if (!first || !last) return []
  const counts = new Map(sorted.map((bucket) => [Date.parse(bucket.t), bucket.count]))
  const filled: HistogramBucket[] = []
  for (let time = Date.parse(first.t); time <= Date.parse(last.t); time += bucketMs) {
    filled.push({ t: new Date(time).toISOString(), count: counts.get(time) ?? 0 })
  }
  return filled
}

/** Buckets `a`..`b` (either order) as a time range: `to` is exclusive, so it is the end of `b`. */
export function rangeForBuckets(
  buckets: readonly HistogramBucket[],
  a: number,
  b: number,
  bucketMs: number,
): { from: string; to: string } | null {
  const start = buckets[Math.min(a, b)]
  const end = buckets[Math.max(a, b)]
  if (!start || !end) return null
  return {
    from: start.t,
    to: new Date(Date.parse(end.t) + bucketMs).toISOString(),
  }
}

export interface StatusBucket {
  t: string
  ok: number
  blocked: number
  error: number
  total: number
}

/** One histogram per status → one even time axis with a count per status. */
export function mergeStatusHistograms(
  byStatus: Partial<Record<EventStatus, readonly HistogramBucket[]>>,
  bucketMs: number,
  /** Buckets that set the time axis (e.g. every agent's), so several merges line up. */
  axisFrom?: readonly HistogramBucket[],
): StatusBucket[] {
  const all = axisFrom ?? Object.values(byStatus).flat()
  const axis = fillGaps(
    all.map((bucket) => ({ t: bucket.t, count: 0 })),
    bucketMs,
  )
  const index = new Map(axis.map((bucket, i) => [Date.parse(bucket.t), i]))
  const merged: StatusBucket[] = axis.map((bucket) => ({
    t: bucket.t,
    ok: 0,
    blocked: 0,
    error: 0,
    total: 0,
  }))
  for (const status of EVENT_STATUSES) {
    for (const bucket of byStatus[status] ?? []) {
      const row = merged[index.get(Date.parse(bucket.t)) ?? -1]
      if (!row) continue
      row[status] += bucket.count
      row.total += bucket.count
    }
  }
  return merged
}

export interface StatusTotals {
  total: number
  ok: number
  blocked: number
  error: number
}

export function sumStatuses(buckets: readonly StatusBucket[]): StatusTotals {
  const totals: StatusTotals = { total: 0, ok: 0, blocked: 0, error: 0 }
  for (const bucket of buckets) {
    totals.total += bucket.total
    totals.ok += bucket.ok
    totals.blocked += bucket.blocked
    totals.error += bucket.error
  }
  return totals
}

/** The period of the same length just before `from`–`to`, or null without a start or end. */
export function previousRange(
  from: string | null,
  to: string | null,
): { from: string; to: string } | null {
  if (from === null || to === null) return null
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null
  return { from: new Date(start - (end - start)).toISOString(), to: from }
}

/** Share of `part` in `total` as a percentage, or null when there is nothing to divide. */
export function rate(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null
}

/** Change in percentage points between two rates, or null when either is unknown. */
export function rateDelta(now: number | null, before: number | null): number | null {
  return now === null || before === null ? null : now - before
}

export interface AgentRow {
  agent: string
  total: number
  ok: number
  blocked: number
  error: number
  /** Events per bucket and errors per bucket, on the same time axis as `buckets`. */
  trend: number[]
  errorTrend: number[]
}

/** One row per agent, sorted by most errors, then most events. */
export function agentRows(byAgent: ReadonlyMap<string, readonly StatusBucket[]>): AgentRow[] {
  const rows: AgentRow[] = []
  for (const [agent, buckets] of byAgent) {
    const totals = sumStatuses(buckets)
    rows.push({
      agent,
      total: totals.total,
      ok: totals.ok,
      blocked: totals.blocked,
      error: totals.error,
      trend: buckets.map((bucket) => bucket.total),
      errorTrend: buckets.map((bucket) => bucket.error),
    })
  }
  return rows.sort(
    (a, b) => b.error - a.error || b.total - a.total || a.agent.localeCompare(b.agent),
  )
}

/**
 * Whether the bucket size can be chosen yet: an open-ended range ("since 06:00") is measured to
 * the newest event, so querying before that has loaded would fetch every chart twice.
 */
export function bucketReady(
  filters: Pick<EventFilters, 'from' | 'to'>,
  newestIso: string | null | undefined,
): boolean {
  return filters.from === null || filters.to !== null || newestIso !== undefined
}
