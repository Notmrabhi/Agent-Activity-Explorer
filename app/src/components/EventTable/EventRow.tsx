import { memo } from 'react'
import type { EventSummary } from '../../api/types'
import { formatLatency, formatTimestampUtc, SLOW_LATENCY_MS } from '../../lib/format'
import { AgentAvatar } from '../ui/AgentAvatar'
import { StatusBadge } from '../ui/StatusBadge'
import { ARGS_COLUMN, ROW_GRID } from './columns'

export interface EventRowProps {
  event: EventSummary
  /** Absolute index in the loaded list (not the position within the rendered window). */
  index: number
  /** Offset from the top of the spacer, in px. */
  top: number
  /** This row's event is open in the detail panel. */
  selected: boolean
  /** This row is the grid's single Tab stop (roving tabindex). */
  active: boolean
  /** Make this row the active one. Must be a stable function: rows are memoised. */
  onActivate: (index: number) => void
  /** Open this row's event. Must be a stable function: rows are memoised. */
  onOpen: (index: number) => void
}

/**
 * One event in the virtualised grid. Memoised: while scrolling, rows that stay in the window
 * receive identical props (absolute index, absolute offset, stable callbacks) and skip
 * rendering entirely; only rows entering the window render.
 */
export const EventRow = memo(function EventRow({ event, index, top, selected, active, onActivate, onOpen }: EventRowProps) {
  const slow = event.latencyMs >= SLOW_LATENCY_MS
  return (
    <div
      role="row"
      id={`event-row-${event.id}`}
      // Header is row 1, so the first event is row 2. Lets screen readers say "row 1,204 of 50,001"
      // even though only ~40 rows exist in the DOM.
      aria-rowindex={index + 2}
      aria-selected={selected}
      tabIndex={active ? 0 : -1}
      data-index={index}
      onClick={(event) => {
        // A drag that selected text inside the row is not a click.
        const selection = window.getSelection()
        if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return
        onActivate(index)
        onOpen(index)
      }}
      // translateY instead of `top`: moving a row is a compositor-only change, no layout.
      style={{ transform: `translateY(${top}px)` }}
      className={`${ROW_GRID} absolute inset-x-0 top-0 h-(--row-height) cursor-pointer border-b border-border text-base focus-visible:-outline-offset-2 ${
        selected ? 'bg-selected ring-1 ring-accent ring-inset' : 'hover:bg-hover'
      }`}
    >
      <div role="gridcell" className="font-mono text-data whitespace-nowrap text-muted">
        {formatTimestampUtc(event.timestamp)}
      </div>
      <div role="gridcell" className="flex min-w-0 items-center gap-2">
        <AgentAvatar name={event.agent} />
        <span className="truncate font-medium" title={event.agent}>
          {event.agent}
        </span>
      </div>
      <div role="gridcell" className="truncate font-mono text-data" title={event.tool}>
        {event.tool}
      </div>
      <div role="gridcell" className="min-w-0">
        <StatusBadge status={event.status} />
      </div>
      {/* Slow calls are emphasised by weight as well as colour. */}
      <div
        role="gridcell"
        className={`text-right font-mono text-data whitespace-nowrap ${slow ? 'font-medium text-fg' : 'text-muted'}`}
      >
        {formatLatency(event.latencyMs)}
      </div>
      <div role="gridcell" className={`${ARGS_COLUMN} truncate font-mono text-xs text-subtle`} title={event.argsPreview}>
        {event.argsPreview}
      </div>
    </div>
  )
})
