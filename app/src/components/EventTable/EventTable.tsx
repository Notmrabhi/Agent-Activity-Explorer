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
  /** Fetch the next page. Called automatically near the end, and by the Retry button. */
  onLoadMore: () => void
  /** `replace` is true when the keyboard moves the selection while the panel is already open. */
  onOpen: (id: string, options: { replace: boolean }) => void
  /** Changes whenever the filters change: scroll back to the top and reset the active row. */
  resetKey: string
  ref?: Ref<EventTableHandle>
}

// Varied bar widths so the placeholder reads as "rows of data", not a striped block.
// Full static class names (Tailwind scans source text). [agent, tool, args]
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
 * The event list: a hand-built virtualised ARIA grid.
 *
 * Layout: the header row sits outside the scroll container so it never scrolls. Inside the
 * scroll container a spacer as tall as every *loaded* row gives the scrollbar its real size,
 * and only the rows in the window `useVirtualRows` computes (~viewport + 2 × overscan, about
 * 40 rows) exist in the DOM, each absolutely positioned at `index × ROW_HEIGHT`.
 * Rows are keyed by event id and memoised, so scrolling only renders the rows that enter.
 *
 * Keyboard: roving tabindex (one Tab stop). Arrow keys / J K, Home End, PageUp PageDown move,
 * Enter / Space open. The active row is always rendered, even when scrolled out of the window,
 * so the focused element is never unmounted (which would drop focus to <body>).
 *
 * Infinite loading: when the window gets within LOAD_MORE_THRESHOLD rows of the end, fetch the
 * next page. After a failure we never retry on our own; the footer offers Retry.
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

  // The roving-focus target. Stored unclamped; clamped on read because the list can shrink
  // (new filters) between the update and the render.
  const [activeIndex, setActiveIndex] = useState(0)
  const active = rows.length === 0 ? -1 : Math.min(activeIndex, rows.length - 1)

  // Latest props for the stable callbacks handed to memoised rows. Updated in a layout effect
  // so they are current before any event handler can run.
  const latest = useRef({ rows, selectedId, onOpen, onLoadMore })
  useLayoutEffect(() => {
    latest.current = { rows, selectedId, onOpen, onLoadMore }
  })

  // --- Focus after render -------------------------------------------------------------------
  // A keyboard move may target a row that is not mounted yet (PageDown, End). We record the
  // index and focus it in a layout effect, after React has rendered it. The counter makes sure
  // a commit (and so the effect) happens even when activeIndex itself does not change.
  const pendingFocusRef = useRef<number | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  useLayoutEffect(() => {
    const index = pendingFocusRef.current
    if (index === null) return
    pendingFocusRef.current = null
    // preventScroll: scrollToIndex already did a minimal "nearest" scroll.
    scrollRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus({ preventScroll: true })
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

  // --- Opening events from the grid ---------------------------------------------------------
  // Ids the grid has asked to open that have not come back as `selectedId` yet. The router
  // applies navigations in a transition, so `selectedId` can lag a render or two behind a fast
  // J/K burst. Without this list the "follow the selection" effect below would treat that lagging
  // echo of our own request as an outside change and snap the active row back.
  const ownOpensRef = useRef<string[]>([])
  const requestOpen = useCallback((id: string, replace: boolean) => {
    // Re-opening the open event produces no selectedId change, so there is nothing to wait for.
    if (id !== latest.current.selectedId) ownOpensRef.current.push(id)
    latest.current.onOpen(id, { replace })
  }, [])

  // --- Stable row callbacks (identity never changes, so memoised rows never re-render for them)
  const handleActivate = useCallback((index: number) => setActiveIndex(index), [])
  const handleOpenRow = useCallback(
    (index: number) => {
      const { rows: current, selectedId: openId } = latest.current
      const row = current[index]
      // Re-opening the event that is already open must not push a duplicate history entry.
      if (row) requestOpen(row.id, row.id === openId)
    },
    [requestOpen],
  )

  // --- Filters changed: back to the top ------------------------------------------------------
  // The active row is reset during render (React's "adjust state when a prop changes"
  // pattern), so no frame is rendered with the old index; the scroll is a DOM side effect.
  const [renderedResetKey, setRenderedResetKey] = useState(resetKey)
  if (renderedResetKey !== resetKey) {
    setRenderedResetKey(resetKey)
    setActiveIndex(0)
  }
  // The last selectedId the grid has reacted to (see the next effect).
  const followedIdRef = useRef<string | null>(null)
  // Runs before the selection sync below (layout effects run in declaration order).
  const resetKeyRef = useRef(resetKey)
  useLayoutEffect(() => {
    if (resetKeyRef.current === resetKey) return
    resetKeyRef.current = resetKey
    // scrollToIndex(0) also commits the new window immediately (no blank frame).
    scrollToIndex(0)
    // Keep an open panel where it is: don't yank the new list to the open event.
    followedIdRef.current = selectedId
  }, [resetKey, selectedId, scrollToIndex])

  // --- Rows added above (live mode) ----------------------------------------------------------
  // When new events are prepended, keep the same event as the active row, and if the user has
  // scrolled, move scrollTop by the added rows so the rows on screen stay exactly where they were.
  const previousRef = useRef({ firstId: rows[0]?.id, length: rows.length, resetKey, isStale })
  useLayoutEffect(() => {
    const previous = previousRef.current
    previousRef.current = { firstId: rows[0]?.id, length: rows.length, resetKey, isStale }
    // New filters, or the placeholder rows being swapped for the real ones, give a different
    // list, not new rows on top.
    if (previous.resetKey !== resetKey || previous.isStale || isStale) return
    if (previous.firstId === undefined || rows[0]?.id === previous.firstId) return
    const added = rows.findIndex((row) => row.id === previous.firstId)
    if (added <= 0 || rows.length - previous.length !== added) return
    // oxlint-disable-next-line react/set-state-in-effect
    setActiveIndex((index) => index + added)
    if ((scrollRef.current?.scrollTop ?? 0) > 0) scrollBy(added * ROW_HEIGHT)
  }, [rows, resetKey, isStale, scrollBy])

  // --- Follow the selection when it changes from outside -------------------------------------
  // Panel prev/next buttons, back/forward and a cold load of a shared link change selectedId
  // without going through the grid. Point the active row at it and bring it into view, once per
  // change: after that the user may scroll away freely. Waits while rows are stale (old
  // filters) or while the event is not loaded yet (it re-checks as pages arrive).
  useLayoutEffect(() => {
    if (selectedId === followedIdRef.current) return
    if (selectedId === null) {
      followedIdRef.current = null
      ownOpensRef.current = []
      return
    }
    const ownPosition = ownOpensRef.current.indexOf(selectedId)
    if (ownPosition !== -1) {
      // Our own request caught up (possibly skipping intermediate ones): the active row is
      // already where the user put it.
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
    // This effect has to touch the DOM (scroll, read document.activeElement), so it cannot be
    // derived during render. As a layout effect, the extra render lands before paint.
    // oxlint-disable-next-line react/set-state-in-effect
    setActiveIndex(index)
    // If focus is inside the list (e.g. the user pressed Alt+Left on a row), follow it so it is
    // not left on a row that is about to be unmounted.
    if (scrollRef.current?.contains(document.activeElement)) {
      pendingFocusRef.current = index
      setFocusRequest((n) => n + 1)
    }
  }, [selectedId, rows, isStale, active, scrollToIndex])

  // --- Infinite loading -----------------------------------------------------------------------
  // onLoadMore comes from `latest`, not the deps: a new function identity from the parent must
  // not re-run this effect (TanStack's fetchNextPage would start a second request).
  useEffect(() => {
    if (isInitialLoading || isStale) return
    if (!hasNextPage || isFetchingNextPage || isFetchNextPageError) return
    if (shouldLoadMore(end, rows.length)) latest.current.onLoadMore()
  }, [end, rows.length, hasNextPage, isFetchingNextPage, isFetchNextPageError, isInitialLoading, isStale])

  // --- Imperative API for the page (return focus after closing the panel, shortcuts) ---------
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

  // --- Keyboard ------------------------------------------------------------------------------
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    // Only keys pressed on a row: Enter on the footer's Retry button must stay a button press.
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
    // Handled: keep the browser from also scrolling the container / page, and keep page-level
    // J/K shortcuts from moving a second time.
    event.preventDefault()
    event.stopPropagation()

    next = Math.min(Math.max(next, 0), last)
    if (next === active) return
    moveFocusTo(next)
    const row = rows[next]
    // With the panel open, the panel follows the keyboard. replace: stepping through 50 events
    // should not leave 50 history entries.
    if (row && selectedId !== null) requestOpen(row.id, true)
  }

  // --- Which rows to render ------------------------------------------------------------------
  // The window [start, end) plus the active row if it has scrolled out of it, kept in index
  // order so the reading order stays sensible for screen readers.
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
      {/* scrollbar-gutter on both the header and the scroll container reserves the same space
          for the scrollbar, so 1fr columns line up even with classic (non-overlay) scrollbars. */}
      <div
        role="row"
        aria-rowindex={1}
        className={`${ROW_GRID} h-9 shrink-0 overflow-hidden border-b border-border bg-sunken text-xs font-medium tracking-wide text-muted uppercase [scrollbar-gutter:stable]`}
      >
        {COLUMNS.map((column) => (
          <div key={column.label} role="columnheader" className={`truncate ${column.className ?? ''}`}>
            {column.label}
          </div>
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isStale && (
          // Indeterminate progress: a sweeping accent gradient; a solid bar under reduced motion.
          <div aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-accent-soft">
            <div className="h-full bg-accent motion-safe:animate-shimmer motion-safe:bg-transparent motion-safe:bg-linear-to-r motion-safe:bg-size-[200%_100%] motion-safe:from-transparent motion-safe:via-accent motion-safe:to-transparent" />
          </div>
        )}

        {/* overflow-anchor: none, because prepended rows are anchored by hand (see above). */}
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
                  <div key={i} aria-hidden="true" className={`${ROW_GRID} h-(--row-height) border-b border-border`}>
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
              <div role="gridcell" className="flex h-12 items-center justify-center gap-2 px-4 text-sm text-muted">
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
                    {/* Loaded rows stay; nothing retries on its own. */}
                    <Button size="sm" onClick={onLoadMore} className="ml-1">
                      Retry
                    </Button>
                  </>
                ) : !hasNextPage ? (
                  <>
                    <CheckIcon size={14} strokeWidth={2.4} />
                    <span>
                      End of results · all <span className="font-mono text-fg">{formatCount(rows.length)}</span> events
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
