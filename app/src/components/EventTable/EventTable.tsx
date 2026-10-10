import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { ApiError } from '../../api/client'
import type { EventSummary } from '../../api/types'
import { useVirtualRows } from '../../hooks/useVirtualRows'
import { formatCount } from '../../lib/format'
import { ROW_HEIGHT, shouldLoadMore } from '../../lib/virtual'
import { Skeleton } from '../feedback/Skeleton'
import { Spinner } from '../feedback/Spinner'
import { Button } from '../ui/Button'
import { CheckIcon } from '../ui/icons'
import { ARGS_COLUMN, COLUMNS, ROW_GRID } from './columns'
import { EventRow } from './EventRow'

export interface EventTableHandle {
  /** Make the row for `id` the active row, scroll it into view and focus it. False if not loaded. */
  focusRow(id: string): boolean
  /** Focus the active row (the grid's Tab stop). No-op while there are no rows. */
  focusTable(): void
  /** True when the list is scrolled to (about) the top. */
  isAtTop(): boolean
}

export interface EventTableProps {
  rows: EventSummary[]
  /** Server-side total for the current filters; null until the first page arrives. */
  total: number | null
  /** The event open in the detail panel, if any. */
  selectedId: string | null
  /** No data yet: show skeleton rows. */
  isInitialLoading: boolean
  /** Showing the previous filters' rows while the new ones load: dim them and show progress. */
  isStale: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  nextPageError: unknown
  /** Called near the end of the list and by the Retry button. */
  onLoadMore: () => void
  /** `replace` is true when the keyboard moves the selection while the panel is already open. */
  onOpen: (id: string, options: { replace: boolean }) => void
  /** Changes whenever the filters change: scroll back to the top and reset the active row. */
  resetKey: string
  ref?: Ref<EventTableHandle>
}

// Full class names: Tailwind only finds classes written out in the source. [agent, tool, args]
const SKELETON_WIDTHS = [
  ['w-24', 'w-28', 'w-3/4'],
  ['w-32', 'w-20', 'w-1/2'],
  ['w-20', 'w-32', 'w-2/3'],
  ['w-28', 'w-24', 'w-5/6'],
  ['w-24', 'w-36', 'w-1/2'],
  ['w-36', 'w-20', 'w-3/4'],
  ['w-20', 'w-28', 'w-2/3'],
  ['w-32', 'w-24', 'w-1/3'],
  ['w-28', 'w-32', 'w-3/4'],
  ['w-24', 'w-20', 'w-1/2'],
  ['w-36', 'w-28', 'w-5/6'],
  ['w-20', 'w-24', 'w-2/3'],
  ['w-28', 'w-36', 'w-1/2'],
  ['w-32', 'w-20', 'w-3/4'],
] as const

function errorDetail(error: unknown): string | null {
  if (error instanceof ApiError) return error.detail
  if (error instanceof Error && error.message) return error.message
  return null
}

/**
 * Hand-built virtualised ARIA grid: only the visible rows (plus overscan) are in the DOM.
 * Roving tabindex; the active row stays mounted even when scrolled away, so focus is never lost.
 */
export function EventTable({
  rows,
  total,
  selectedId,
  isInitialLoading,
  isStale,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  nextPageError,
  onLoadMore,
  onOpen,
  resetKey,
  ref,
}: EventTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { start, end, totalHeight, viewportHeight, scrollToIndex, scrollBy } = useVirtualRows({
    count: rows.length,
    scrollRef,
  })

  // Clamped on read: the list can shrink between the update and the render.
  const [activeIndex, setActiveIndex] = useState(0)
  const active = rows.length === 0 ? -1 : Math.min(activeIndex, rows.length - 1)

  // Latest props for the stable callbacks passed to memoised rows.
  const latest = useRef({ rows, selectedId, onOpen, onLoadMore })
  useLayoutEffect(() => {
    latest.current = { rows, selectedId, onOpen, onLoadMore }
  })

  // PageDown/End can target a row that isn't mounted yet: focus it after the render.
  const pendingFocusRef = useRef<number | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  useLayoutEffect(() => {
    const index = pendingFocusRef.current
    if (index === null) return
    pendingFocusRef.current = null
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.focus({ preventScroll: true })
  }, [focusRequest])

  const moveFocusTo = useCallback(
    (index: number) => {
      setActiveIndex(index)
      scrollToIndex(index)
      pendingFocusRef.current = index
      setFocusRequest((n) => n + 1)
    },
    [scrollToIndex],
  )

  // Ids we opened that haven't come back as `selectedId` yet (router navigations lag behind a
  // fast J/K burst). Without this the follow effect below would snap the active row back.
  const ownOpensRef = useRef<string[]>([])
  const requestOpen = useCallback((id: string, replace: boolean) => {
    if (id !== latest.current.selectedId) ownOpensRef.current.push(id)
    latest.current.onOpen(id, { replace })
  }, [])

  const handleActivate = useCallback((index: number) => setActiveIndex(index), [])
  const handleOpenRow = useCallback(
    (index: number) => {
      const { rows: current, selectedId: openId } = latest.current
      const row = current[index]
      if (row) requestOpen(row.id, row.id === openId)
    },
    [requestOpen],
  )

  // Filters changed: reset the active row during render, scroll back to the top below.
  const [renderedResetKey, setRenderedResetKey] = useState(resetKey)
  if (renderedResetKey !== resetKey) {
    setRenderedResetKey(resetKey)
    setActiveIndex(0)
  }
  const followedIdRef = useRef<string | null>(null)
  // Must run before the selection sync below (layout effects run in order).
  const resetKeyRef = useRef(resetKey)
  useLayoutEffect(() => {
    if (resetKeyRef.current === resetKey) return
    resetKeyRef.current = resetKey
    scrollToIndex(0)
    // Don't jump the new list to the open event.
    followedIdRef.current = selectedId
  }, [resetKey, selectedId, scrollToIndex])

  // Live rows added above: keep the reader's place; a reader idle at the top stays on the newest row.
  const previousRef = useRef({ firstId: rows[0]?.id, length: rows.length, resetKey, isStale })
  useLayoutEffect(() => {
    const previous = previousRef.current
    previousRef.current = { firstId: rows[0]?.id, length: rows.length, resetKey, isStale }
    // New filters or placeholder rows: a different list, not rows added on top.
    if (previous.resetKey !== resetKey || previous.isStale || isStale) return
    if (previous.firstId === undefined || rows[0]?.id === previous.firstId) return
    const added = rows.findIndex((row) => row.id === previous.firstId)
    if (added <= 0 || rows.length - previous.length < added) return
    const scrolled = (scrollRef.current?.scrollTop ?? 0) > 0
    const picked =
      scrollRef.current?.contains(document.activeElement) === true || selectedId !== null
    // oxlint-disable-next-line react/set-state-in-effect
    if (scrolled || picked) setActiveIndex((index) => index + added)
    if (scrolled) scrollBy(added * ROW_HEIGHT)
  }, [rows, resetKey, isStale, selectedId, scrollBy])

  // Selection changed from outside (panel prev/next, back/forward, shared link): bring it into
  // view once, then let the user scroll freely.
  useLayoutEffect(() => {
    if (selectedId === followedIdRef.current) return
    if (selectedId === null) {
      followedIdRef.current = null
      ownOpensRef.current = []
      return
    }
    const ownPosition = ownOpensRef.current.indexOf(selectedId)
    if (ownPosition !== -1) {
      ownOpensRef.current.splice(0, ownPosition + 1)
      followedIdRef.current = selectedId
      return
    }
    if (isStale) return
    const index = rows.findIndex((row) => row.id === selectedId)
    if (index === -1) return
    followedIdRef.current = selectedId
    ownOpensRef.current = []
    scrollToIndex(index)
    if (index === active) return
    // oxlint-disable-next-line react/set-state-in-effect
    setActiveIndex(index)
    // Move focus along so it isn't left on a row that is about to unmount.
    if (scrollRef.current?.contains(document.activeElement)) {
      pendingFocusRef.current = index
      setFocusRequest((n) => n + 1)
    }
  }, [selectedId, rows, isStale, active, scrollToIndex])

  // onLoadMore is read from `latest`: a new identity must not re-run this and fetch twice.
  useEffect(() => {
    if (isInitialLoading || isStale) return
    if (!hasNextPage || isFetchingNextPage || isFetchNextPageError) return
    if (shouldLoadMore(end, rows.length)) latest.current.onLoadMore()
  }, [
    end,
    rows.length,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isInitialLoading,
    isStale,
  ])

  useImperativeHandle(
    ref,
    () => ({
      focusRow(id) {
        const index = rows.findIndex((row) => row.id === id)
        if (index === -1) return false
        moveFocusTo(index)
        return true
      },
      focusTable() {
        if (active >= 0) moveFocusTo(active)
      },
      isAtTop() {
        return (scrollRef.current?.scrollTop ?? 0) < ROW_HEIGHT / 2
      },
    }),
    [rows, active, moveFocusTo],
  )

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    // Rows only: Enter on the footer's Retry button must stay a button press.
    const target = event.target
    if (!(target instanceof HTMLElement) || target.dataset.index === undefined) return
    if (active < 0) return

    const pageSize = Math.max(1, Math.floor(viewportHeight / ROW_HEIGHT))
    const last = rows.length - 1
    let next: number
    switch (event.key) {
      case 'ArrowDown':
      case 'j':
        next = active + 1
        break
      case 'ArrowUp':
      case 'k':
        next = active - 1
        break
      case 'PageDown':
        next = active + pageSize
        break
      case 'PageUp':
        next = active - pageSize
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      case 'Enter':
      case ' ': {
        event.preventDefault()
        event.stopPropagation()
        handleOpenRow(active)
        return
      }
      default:
        return
    }
    // Stop the browser scrolling and the page-level J/K shortcut moving again.
    event.preventDefault()
    event.stopPropagation()

    next = Math.min(Math.max(next, 0), last)
    if (next === active) return
    moveFocusTo(next)
    const row = rows[next]
    // The open panel follows the keyboard, replacing history instead of adding entries.
    if (row && selectedId !== null) requestOpen(row.id, true)
  }

  // The visible window plus the active row if it scrolled out, in index order.
  const indices: number[] = []
  if (active >= 0 && active < start) indices.push(active)
  for (let i = start; i < end; i++) indices.push(i)
  if (active >= end) indices.push(active)

  const showFooter = rows.length > 0 && !isInitialLoading
  const detail = isFetchNextPageError ? errorDetail(nextPageError) : null

  return (
    <div
      role="grid"
      aria-label="Agent events"
      aria-rowcount={total === null ? -1 : total + 1}
      aria-busy={isStale || isInitialLoading}
      onKeyDown={handleKeyDown}
      className="@container flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-lg border border-border bg-surface"
    >
      {/* Same scrollbar-gutter as the body, so columns line up with classic scrollbars. */}
      <div
        role="row"
        aria-rowindex={1}
        className={`${ROW_GRID} h-9 shrink-0 overflow-hidden border-b border-border bg-sunken text-xs font-medium tracking-wide text-muted uppercase [scrollbar-gutter:stable]`}
      >
        {COLUMNS.map((column) => (
          <div
            key={column.label}
            role="columnheader"
            className={`truncate ${column.className ?? ''}`}
          >
            {column.label}
          </div>
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isStale && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-accent-soft"
          >
            <div className="h-full bg-accent motion-safe:animate-shimmer motion-safe:bg-transparent motion-safe:bg-linear-to-r motion-safe:bg-size-[200%_100%] motion-safe:from-transparent motion-safe:via-accent motion-safe:to-transparent" />
          </div>
        )}

        {/* Rows added above are anchored by hand, so the browser must not anchor too. */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
        >
          {isInitialLoading ? (
            <div role="row">
              <div role="gridcell">
                <span role="status" className="sr-only">
                  Loading events
                </span>
                {SKELETON_WIDTHS.map(([agentWidth, toolWidth, argsWidth], i) => (
                  <div
                    key={i}
                    aria-hidden="true"
                    className={`${ROW_GRID} h-(--row-height) border-b border-border`}
                  >
                    <Skeleton className="h-2.5 w-36" />
                    <div className="flex min-w-0 items-center gap-2">
                      <Skeleton className="size-[22px] shrink-0 rounded-full" />
                      <Skeleton className={`h-2.5 max-w-full ${agentWidth}`} />
                    </div>
                    <Skeleton className={`h-2.5 max-w-full ${toolWidth}`} />
                    <Skeleton className="h-[18px] w-16 rounded-full" />
                    <Skeleton className="ml-auto h-2.5 w-12" />
                    <div className={ARGS_COLUMN}>
                      <Skeleton className={`h-2.5 ${argsWidth}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className={`relative transition-opacity duration-(--duration-fast) ${isStale ? 'opacity-60' : ''}`}
              style={{ height: totalHeight }}
            >
              {indices.map((index) => {
                const event = rows[index]
                if (!event) return null
                return (
                  <EventRow
                    key={event.id}
                    event={event}
                    index={index}
                    top={index * ROW_HEIGHT}
                    selected={event.id === selectedId}
                    active={index === active}
                    onActivate={handleActivate}
                    onOpen={handleOpenRow}
                  />
                )
              })}
            </div>
          )}

          {showFooter && (
            // A row so the grid only contains rows (the Retry button must live in a cell).
            <div role="row">
              <div
                role="gridcell"
                className="flex h-12 items-center justify-center gap-2 px-4 text-sm text-muted"
              >
                {isFetchingNextPage ? (
                  <>
                    <Spinner />
                    Loading more events…
                  </>
                ) : isFetchNextPageError ? (
                  <>
                    <span role="alert" className="flex min-w-0 items-baseline gap-2">
                      <span className="text-error">Couldn’t load more events.</span>
                      {detail !== null && (
                        <span className="truncate font-mono text-xs text-subtle">{detail}</span>
                      )}
                    </span>
                    <Button size="sm" onClick={onLoadMore} className="ml-1">
                      Retry
                    </Button>
                  </>
                ) : !hasNextPage ? (
                  <>
                    <CheckIcon size={14} strokeWidth={2.4} />
                    <span>
                      End of results · all{' '}
                      <span className="font-mono text-fg">{formatCount(rows.length)}</span> events
                      loaded
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
