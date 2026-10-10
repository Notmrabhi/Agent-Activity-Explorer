import { memo } from 'react'
import type { EventSummary } from '../../api/types'
import { formatLatency, formatTimestampUtc, SLOW_LATENCY_MS } from '../../lib/format'
import { AgentAvatar } from '../ui/AgentAvatar'
import { StatusBadge } from '../ui/StatusBadge'
import { ARGS_COLUMN, ROW_GRID } from './columns'

export interface EventRowProps {
  event: EventSummary
  /** In the loaded list, not the rendered window. */
  index: number
  top: number
  selected: boolean
  active: boolean
  /** Must be stable: rows are memoised. */
  onActivate: (index: number) => void
  /** Must be stable: rows are memoised. */
  onOpen: (index: number) => void
}

/** Memoised: while scrolling, only rows entering the window render. */
export const EventRow = memo(function EventRow({
  event,
  index,
  top,
  selected,
  active,
  onActivate,
  onOpen,
}: EventRowProps) {
  const slow = event.latencyMs >= SLOW_LATENCY_MS
  return (
    <div
      role="row"
      id={`event-row-${event.id}`}
      // Header is row 1. Screen readers say "row 1,204 of 50,001" with ~40 rows in the DOM.
      aria-rowindex={index + 2}
      aria-selected={selected}
      tabIndex={active ? 0 : -1}
      data-index={index}
      onClick={(event) => {
        // A drag that selected text inside the row is not a click.
        const selection = window.getSelection()
        if (
          selection &&
          !selection.isCollapsed &&
          event.currentTarget.contains(selection.anchorNode)
        )
          return
        onActivate(index)
        onOpen(index)
      }}
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
      <div
        role="gridcell"
        className={`text-right font-mono text-data whitespace-nowrap ${slow ? 'font-medium text-fg' : 'text-muted'}`}
      >
        {formatLatency(event.latencyMs)}
      </div>
      <div
        role="gridcell"
        className={`${ARGS_COLUMN} truncate font-mono text-xs text-subtle`}
        title={event.argsPreview}
      >
        {event.argsPreview}
      </div>
    </div>
  )
})
