import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { HistogramBucketSize, TimeRange } from '../../api/types'
import { formatCount } from '../../lib/format'
import { BUCKET_MS, rangeForBuckets, type StatusBucket } from '../../lib/histogram'
import { formatAnchor } from '../../lib/timeRange'
import { Skeleton } from '../feedback/Skeleton'
import { Button } from '../ui/Button'

export interface EventsChartProps {
  buckets: StatusBucket[]
  bucket: HistogramBucketSize
  isLoading: boolean
  isError: boolean
  isStale: boolean
  onRetry: () => void
  onSelectRange: (range: TimeRange) => void
  /** Plot height in px. */
  height?: number
  /** Shown before the caption, e.g. a section heading. */
  title?: ReactNode
}

const BUCKET_LABEL: Record<HistogramBucketSize, string> = {
  '1m': 'per minute',
  '5m': 'per 5 minutes',
  '1h': 'per hour',
}

const SEGMENTS = [
  { key: 'ok', label: 'OK', className: 'fill-ok', swatch: 'bg-ok' },
  { key: 'blocked', label: 'Blocked', className: 'fill-blocked', swatch: 'bg-blocked' },
  { key: 'error', label: 'Error', className: 'fill-error', swatch: 'bg-error' },
] as const

/** Events over time, stacked by status. Click a bar or drag across bars to filter by time. */
export function EventsChart({
  buckets,
  bucket,
  isLoading,
  isError,
  isStale,
  onRetry,
  onSelectRange,
  height = 56,
  title,
}: EventsChartProps) {
  const plotRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ anchor: number; current: number } | null>(null)

  if (buckets.length === 0) {
    if (isLoading) {
      return (
        <div style={{ height: height + 40 }}>
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      )
    }
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

  const max = Math.max(1, ...buckets.map((item) => item.total))
  const total = buckets.reduce((sum, item) => sum + item.total, 0)
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
    const range = rangeForBuckets(
      buckets.map((item) => ({ t: item.t, count: item.total })),
      drag.anchor,
      drag.current,
      bucketMs,
    )
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
      <figcaption className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {title}
        <span className="min-w-0 flex-1">
          {shown ? (
            <>
              <span className="font-mono text-fg">{formatAnchor(shown.t)}</span> ·{' '}
              <span className="font-mono text-fg">{formatCount(shown.total)}</span> events ·{' '}
              {formatCount(shown.ok)} OK · {formatCount(shown.blocked)} blocked ·{' '}
              {formatCount(shown.error)} errors
            </>
          ) : (
            <>
              Events {BUCKET_LABEL[bucket]} · peak{' '}
              <span className="font-mono text-fg">{formatCount(max)}</span>
            </>
          )}
        </span>
        <span className="hidden items-center gap-3 sm:flex" aria-hidden="true">
          {SEGMENTS.map((segment) => (
            <span key={segment.key} className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-xs ${segment.swatch}`} />
              {segment.label}
            </span>
          ))}
        </span>
      </figcaption>

      <div
        ref={plotRef}
        className="relative mt-1 cursor-crosshair touch-none select-none"
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          aria-hidden="true"
          className="block h-full w-full"
          viewBox={`0 0 ${buckets.length} ${height}`}
          preserveAspectRatio="none"
        >
          {selectedFrom !== null && selectedTo !== null && (
            <rect
              x={selectedFrom}
              y={0}
              width={selectedTo - selectedFrom + 1}
              height={height}
              className="fill-accent-soft"
            />
          )}
          {buckets.map((item, i) => {
            let y = height
            return (
              <g key={item.t} opacity={hover === null || hover === i ? 1 : 0.75}>
                {SEGMENTS.map((segment) => {
                  const value = item[segment.key]
                  if (value === 0) return null
                  const h = Math.max(0.5, (value / max) * height)
                  y -= h
                  return (
                    <rect
                      key={segment.key}
                      x={i + 0.1}
                      y={y}
                      width={0.8}
                      height={h}
                      className={segment.className}
                    />
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-1 flex justify-between font-mono text-[11px] text-subtle">
        <span>{first ? formatAnchor(first.t) : ''}</span>
        <span className="hidden sm:inline">Click or drag to filter by time</span>
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
