import { useRef, useState, type PointerEvent } from 'react'
import type { HistogramBucket, HistogramBucketSize, TimeRange } from '../../api/types'
import { formatCount } from '../../lib/format'
import { BUCKET_MS, rangeForBuckets } from '../../lib/histogram'
import { formatAnchor } from '../../lib/timeRange'
import { Skeleton } from '../feedback/Skeleton'
import { Button } from '../ui/Button'

export interface EventsChartProps {
  buckets: HistogramBucket[]
  bucket: HistogramBucketSize
  isLoading: boolean
  isError: boolean
  isStale: boolean
  onRetry: () => void
  onSelectRange: (range: TimeRange) => void
}

const BUCKET_LABEL: Record<HistogramBucketSize, string> = {
  '1m': 'per minute',
  '5m': 'per 5 minutes',
  '1h': 'per hour',
}

const CHART_HEIGHT = 56

/** Events over time for the current filters. Click a bar or drag across bars to filter the list. */
export function EventsChart({
  buckets,
  bucket,
  isLoading,
  isError,
  isStale,
  onRetry,
  onSelectRange,
}: EventsChartProps) {
  const plotRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ anchor: number; current: number } | null>(null)

  if (buckets.length === 0) {
    if (isLoading) return <Skeleton className="h-[88px] w-full rounded-lg" />
    if (isError) {
      return (
        <div className="flex h-12 items-center gap-3 rounded-lg border border-border px-3 text-sm">
          <span className="text-error">Couldn’t load the chart.</span>
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )
    }
    return null
  }

  const max = Math.max(1, ...buckets.map((item) => item.count))
  const total = buckets.reduce((sum, item) => sum + item.count, 0)
  const bucketMs = BUCKET_MS[bucket]

  const indexAt = (clientX: number): number => {
    const box = plotRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return 0
    const ratio = (clientX - box.left) / box.width
    return Math.min(buckets.length - 1, Math.max(0, Math.floor(ratio * buckets.length)))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const index = indexAt(event.clientX)
    setDrag({ anchor: index, current: index })
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const index = indexAt(event.clientX)
    setHover(index)
    if (drag) setDrag({ ...drag, current: index })
  }
  const onPointerUp = () => {
    if (!drag) return
    const range = rangeForBuckets(buckets, drag.anchor, drag.current, bucketMs)
    setDrag(null)
    if (range) onSelectRange(range)
  }

  const selectedFrom = drag ? Math.min(drag.anchor, drag.current) : null
  const selectedTo = drag ? Math.max(drag.anchor, drag.current) : null
  const shown = hover === null ? null : buckets[hover]
  const first = buckets[0]
  const last = buckets.at(-1)

  return (
    <figure
      className={`m-0 rounded-lg border border-border bg-surface px-3 pt-2 pb-1.5 transition-opacity duration-(--duration-fast) ${isStale ? 'opacity-60' : ''}`}
    >
      <figcaption className="flex h-5 items-center justify-between gap-3 text-xs text-muted">
        <span>
          {shown ? (
            <>
              <span className="font-mono text-fg">{formatAnchor(shown.t)}</span> ·{' '}
              <span className="font-mono text-fg">{formatCount(shown.count)}</span> events
            </>
          ) : (
            <>
              Events {BUCKET_LABEL[bucket]} · peak{' '}
              <span className="font-mono text-fg">{formatCount(max)}</span>
            </>
          )}
        </span>
        <span className="hidden sm:inline">Click or drag to filter by time</span>
      </figcaption>

      <div
        ref={plotRef}
        className="relative mt-1 cursor-crosshair touch-none select-none"
        style={{ height: CHART_HEIGHT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          aria-hidden="true"
          className="block h-full w-full"
          viewBox={`0 0 ${buckets.length} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
        >
          {selectedFrom !== null && selectedTo !== null && (
            <rect
              x={selectedFrom}
              y={0}
              width={selectedTo - selectedFrom + 1}
              height={CHART_HEIGHT}
              className="fill-accent-soft"
            />
          )}
          {buckets.map((item, i) => {
            const height = item.count === 0 ? 0 : Math.max(1, (item.count / max) * CHART_HEIGHT)
            return (
              <rect
                key={item.t}
                x={i + 0.1}
                y={CHART_HEIGHT - height}
                width={0.8}
                height={height}
                className={i === hover ? 'fill-accent-hover' : 'fill-accent'}
              />
            )
          })}
        </svg>
      </div>

      <div className="mt-1 flex justify-between font-mono text-[11px] text-subtle">
        <span>{first ? formatAnchor(first.t) : ''}</span>
        <span>{last ? formatAnchor(last.t) : ''}</span>
      </div>
      <p className="sr-only">
        {formatCount(total)} events from {first ? formatAnchor(first.t) : ''} to{' '}
        {last ? formatAnchor(last.t) : ''} UTC, at most {formatCount(max)} {BUCKET_LABEL[bucket]}.
        Use the Time filter to choose a range with the keyboard.
      </p>
    </figure>
  )
}
