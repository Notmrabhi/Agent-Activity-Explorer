import { useState } from 'react'
import { formatCount } from '../../lib/format'
import { Spinner } from '../feedback/Spinner'

export interface ResultCountProps {
  /** Total matching events, or null before the first page has loaded. */
  total: number | null
  /** Rows loaded so far (all pages). */
  loadedCount: number
  /** True while the list is loading for the current filters (first page or new filters). */
  isLoading: boolean
  /** Changes with the filters: the total is announced for a new result set, not as live events raise it. */
  resultKey: string
  className?: string
}

const plural = (count: number) => (count === 1 ? 'event' : 'events')

/** Sentence for screen readers. Depends on `total` only, so it changes when the result set does. */
function totalSentence(total: number | null): string {
  if (total === null) return ''
  if (total === 0) return 'No events match'
  return `${formatCount(total)} ${plural(total)} match`
}

/**
 * "Showing 150 of 50,213 events". The visible text updates as pages load and live events
 * arrive, but only a new result set (new filters, or loading finished) is announced: a live
 * region that spoke on every page or every streamed event would be noise.
 */
export function ResultCount({ total, loadedCount, isLoading, resultKey, className }: ResultCountProps) {
  const sentence = totalSentence(total)
  const [spoken, setSpoken] = useState({ key: resultKey, isLoading, text: sentence })
  if (spoken.key !== resultKey || spoken.isLoading !== isLoading) {
    setSpoken({ key: resultKey, isLoading, text: isLoading ? spoken.text : sentence })
  }

  const number = (value: number) => (
    <span className="font-mono text-fg">{formatCount(value)}</span>
  )

  let content
  if (total === null) {
    content = isLoading ? (
      <span className="inline-flex items-center gap-2">
        <Spinner />
        Loading events…
      </span>
    ) : null
  } else if (total === 0) {
    content = 'No events'
  } else if (loadedCount < total) {
    content = (
      <>
        Showing {number(loadedCount)} of {number(total)} {plural(total)}
      </>
    )
  } else {
    content = (
      <>
        {number(total)} {plural(total)}
      </>
    )
  }

  return (
    <div className={`text-sm whitespace-nowrap text-muted ${className ?? ''}`}>
      <p className="inline-flex items-center gap-2">
        {/* New filters loading over the previous count: hint that it is about to change. */}
        {isLoading && total !== null && <Spinner />}
        <span className={isLoading && total !== null ? 'opacity-60' : ''}>{content}</span>
      </p>
      {/* Always mounted: a live region only announces changes made after it is in the DOM. */}
      <span className="sr-only" aria-live="polite">
        {spoken.text}
      </span>
    </div>
  )
}
