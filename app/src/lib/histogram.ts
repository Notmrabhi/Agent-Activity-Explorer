import type { EventFilters, HistogramBucket, HistogramBucketSize } from '../api/types'

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
