import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { EventFilters, EventSummary } from '../api/types'
import { DetailPanel } from '../components/DetailPanel/DetailPanel'
import { ResizeHandle } from '../components/DetailPanel/ResizeHandle'
import { EventTable, type EventTableHandle } from '../components/EventTable/EventTable'
import { EmptyState } from '../components/feedback/EmptyState'
import { ErrorState } from '../components/feedback/ErrorState'
import { SlowNotice } from '../components/feedback/SlowNotice'
import { AppHeader } from '../components/Header/AppHeader'
import { LiveToggle } from '../components/Live/LiveToggle'
import { NewEventsPill } from '../components/Live/NewEventsPill'
import { ShortcutsDialog } from '../components/ShortcutsDialog'
import { Toolbar } from '../components/Toolbar/Toolbar'
import { Button } from '../components/ui/Button'
import { InboxIcon } from '../components/ui/icons'
import { useEventDetail, useEventList, useNewestEventTime } from '../hooks/useEvents'
import { useExplorerUrlState } from '../hooks/useExplorerUrlState'
import { useLiveEvents } from '../hooks/useLiveEvents'
import { DOCKED_PANEL_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { panelWidthStyle, usePanelWidth } from '../hooks/usePanelWidth'
import { useSlowFlag } from '../hooks/useSlowFlag'
import { STATUS_LABELS } from '../lib/format'
import { describeRangeInWords, formatAnchor } from '../lib/timeRange'
import { hasActiveFilters, serializeExplorerParams } from '../lib/urlState'

const APP_TITLE = 'Agent Activity'

/** The resize handle's aria-controls target. */
const DETAIL_PANEL_ID = 'event-detail-panel'

/** Any dialog except the detail panel: those own their keys (shortcuts dialog, filter popovers). */
const OTHER_DIALOG_SELECTOR =
  'dialog[open]:not([data-detail-panel]), [role="dialog"]:not([data-detail-panel])'

function hasTimeRange(filters: EventFilters): boolean {
  return filters.from !== null || filters.to !== null
}

function isEditableTarget(target: Element): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/**
 * Names the filters that produced nothing, e.g. Nothing for “stripe” from <b>devops</b> with
 * status <b>Error</b> <b>between Oct 09 11:00 and 12:00 UTC</b>.
 */
function describeEmpty(filters: EventFilters, newest: string | null | undefined): ReactNode {
  const strong = 'font-medium text-fg'
  const q = filters.q.trim()
  return (
    <>
      Nothing
      {q !== '' && <> for “{q}”</>}
      {filters.agents.length > 0 && (
        <>
          {' '}
          from <b className={strong}>{filters.agents.join(', ')}</b>
        </>
      )}
      {filters.status !== null && (
        <>
          {' '}
          with status <b className={strong}>{STATUS_LABELS[filters.status]}</b>
        </>
      )}
      {hasTimeRange(filters) && (
        <>
          {' '}
          <b className={strong}>{describeRangeInWords(filters.from, filters.to)}</b>
        </>
      )}
      .
      {newest && filters.from !== null && Date.parse(newest) < Date.parse(filters.from) && (
        <>
          {' '}
          The newest event is from <b className={strong}>{formatAnchor(newest)} UTC</b>, before this
          range starts.
        </>
      )}
    </>
  )
}

/**
 * The whole app: header, search/filter bar, the virtualised event list and the detail panel.
 *
 * All view state comes from the URL (useExplorerUrlState); all server state from TanStack Query
 * (useEventList). This component only wires them together, picks which list state to show and
 * owns the page-level keyboard shortcuts.
 */
export default function ExplorerPage() {
  const url = useExplorerUrlState()
  const {
    filters,
    eventId,
    setQuery,
    setAgents,
    setStatus,
    setTimeRange,
    clearFilters,
    openEvent,
    closeEvent,
  } = url
  const list = useEventList(filters)
  // Already loaded for the time-range presets; the empty state uses it to explain a range past the data.
  const newestTime = useNewestEventTime()
  const { rows, total } = list
  const docked = useMediaQuery(DOCKED_PANEL_QUERY)
  const listSlow = useSlowFlag(list.isFetching)
  const panelWidth = usePanelWidth()

  const tableRef = useRef<EventTableHandle>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // --- Live mode ------------------------------------------------------------------------------
  // New events go straight in only when that can't disturb anyone: the list is at the top, the
  // pointer isn't over it and focus isn't in it. Otherwise they wait behind the "new events" pill.
  const [liveOn, setLiveOn] = useState(false)
  // :hover rather than pointerenter/leave bookkeeping, which can miss a transition and then
  // insert under a pointer that is resting on the list.
  const listAreaRef = useRef<HTMLDivElement>(null)
  const canInsertNow = useCallback(() => {
    if (listAreaRef.current?.matches(':hover')) return false
    if (document.activeElement?.closest('[role="grid"]')) return false
    return tableRef.current?.isAtTop() ?? true
  }, [])
  const live = useLiveEvents(liveOn, filters, canInsertNow)
  // Set when the user asks for the waiting events: once they are in, show the newest one.
  const revealNewestRef = useRef(false)
  const { showPending } = live
  const showNewEvents = useCallback(() => {
    revealNewestRef.current = true
    void showPending().then((shown) => {
      if (!shown) revealNewestRef.current = false
    })
  }, [showPending])

  // id -> position in the loaded rows: the panel's summary and its prev/next neighbours.
  const indexById = useMemo(() => new Map(rows.map((row, index) => [row.id, index])), [rows])
  const openIndex = eventId === null ? undefined : indexById.get(eventId)
  const openSummary: EventSummary | undefined =
    openIndex === undefined ? undefined : rows[openIndex]
  const prevRow = openIndex === undefined ? undefined : rows[openIndex - 1]
  const nextRow = openIndex === undefined ? undefined : rows[openIndex + 1]

  // --- Prev / next ----------------------------------------------------------------------------
  // The router writes the URL at once but applies it in a transition, so `eventId` can lag a
  // render behind a fast J/K burst (or key repeat). Stepping from the lagging id would re-request
  // the same neighbour and stall, so steps are taken from the newest id we asked for. Ids are
  // dropped once the URL catches up; any other change (Back, a click in the list) clears them.
  const requestedIdsRef = useRef<string[]>([])
  // The event the panel is showing or about to show (the newest step asked for). Focus return
  // uses it: a fast "kkk Esc" can close the panel before the router commits the last steps, and
  // the row to return to is the one the user stepped to, not the last one rendered.
  const lastOpenIdRef = useRef(eventId)
  useLayoutEffect(() => {
    const requested = requestedIdsRef.current
    const position = eventId === null ? -1 : requested.indexOf(eventId)
    requestedIdsRef.current = position === -1 ? [] : requested.slice(position + 1)
    if (eventId !== null) lastOpenIdRef.current = requestedIdsRef.current.at(-1) ?? eventId
  }, [eventId])

  // The pill disappears once clicked; move focus to the newest row so keyboard users land
  // somewhere sensible (focusRow also scrolls it into view).
  const eventsWaiting = live.pendingCount > 0 || live.needsRefresh
  useLayoutEffect(() => {
    const newest = rows[0]
    if (!revealNewestRef.current || !newest || eventsWaiting) return
    revealNewestRef.current = false
    tableRef.current?.focusRow(newest.id)
  }, [rows, eventsWaiting])

  const step = useCallback(
    (delta: 1 | -1) => {
      const from = requestedIdsRef.current.at(-1) ?? eventId
      const index = from === null ? undefined : indexById.get(from)
      const target = index === undefined ? undefined : rows[index + delta]
      if (!target) return
      requestedIdsRef.current.push(target.id)
      lastOpenIdRef.current = target.id
      // replace: stepping through events should not leave one history entry per event.
      openEvent(target.id, { replace: true })
    },
    [eventId, indexById, rows, openEvent],
  )
  const goPrev = useCallback(() => step(-1), [step])
  const goNext = useCallback(() => step(1), [step])

  // Opening from the list (click, Enter, J/K in the grid) records the target the same way `step`
  // does. Otherwise "click row B, Esc" within one render returns focus to the previous row A,
  // because `eventId` has not caught up with the click yet.
  const openFromList = useCallback(
    (id: string, options: { replace?: boolean }) => {
      requestedIdsRef.current = []
      lastOpenIdRef.current = id
      openEvent(id, options)
    },
    [openEvent],
  )

  // --- Focus return ---------------------------------------------------------------------------
  // When the panel closes (Esc, close button, Back), put focus back on the row that was open, so
  // keyboard users keep their place. Only when focus was lost with the panel (on <body>) or is
  // still in the list: if the user closed it by moving somewhere else, leave focus there.
  const prevEventIdRef = useRef(eventId)
  useEffect(() => {
    const closedId = prevEventIdRef.current
    prevEventIdRef.current = eventId
    if (closedId === null || eventId !== null) return
    const focused = document.activeElement
    if (focused !== null && focused !== document.body && focused.closest('[role="grid"]') === null)
      return
    const rowId = lastOpenIdRef.current ?? closedId
    if (!tableRef.current?.focusRow(rowId)) tableRef.current?.focusTable()
  }, [eventId])

  // --- Document title -------------------------------------------------------------------------
  // The detail query is shared with the panel (same key), so this adds no request. It names a
  // cold-linked event that is not in the loaded rows yet.
  const detail = useEventDetail(eventId)
  const openHead = openSummary ?? detail.data
  useEffect(() => {
    document.title = openHead ? `${openHead.tool} · ${openHead.agent} — ${APP_TITLE}` : APP_TITLE
  }, [openHead])

  // --- Global shortcuts -----------------------------------------------------------------------
  // "/" search, "?" shortcuts, J/K step through events while the panel is open. Keys typed into
  // fields, already handled (the grid handles its own J/K and arrows and stops them), or pressed
  // inside another dialog are left alone. Esc is the panel's and the dialogs' own business.
  const onDocumentKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target
    if (target instanceof Element) {
      if (isEditableTarget(target)) return
      if (target.closest(OTHER_DIALOG_SELECTOR) !== null) return
    }
    const inPanel = target instanceof Element && target.closest('[data-detail-panel]') !== null

    switch (event.key) {
      case '/':
        // The overlay panel is modal (the toolbar is inert behind it), so "/" can't reach search.
        if (inPanel && !docked) return
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      case '?':
        event.preventDefault()
        setShortcutsOpen(true)
        return
      case 'j':
      case 'k': {
        if (eventId === null) return
        if (target instanceof Element && target.closest('[role="grid"]') !== null) return
        event.preventDefault()
        if (event.key === 'j') goNext()
        else goPrev()
        return
      }
      default:
    }
  })

  useEffect(() => {
    document.addEventListener('keydown', onDocumentKeyDown)
    return () => document.removeEventListener('keydown', onDocumentKeyDown)
  }, [])

  // --- List actions ---------------------------------------------------------------------------
  const { refetch, fetchNextPage } = list
  const retryList = useCallback(() => {
    void refetch()
  }, [refetch])
  // A slow next page is re-requested on its own; anything else (first page, new filters) restarts
  // the list query. cancelRefetch aborts the slow request instead of waiting behind it.
  const retrySlow = useCallback(() => {
    if (list.isFetchingNextPage) void fetchNextPage({ cancelRefetch: true })
    else void refetch({ cancelRefetch: true })
  }, [list.isFetchingNextPage, fetchNextPage, refetch])
  const loadMore = useCallback(() => {
    void fetchNextPage()
  }, [fetchNextPage])

  const focusSearch = () => searchInputRef.current?.focus()
  const clearAllFromEmpty = () => {
    clearFilters()
    // The empty state (and the button) unmounts; park focus in the search box, not on <body>.
    focusSearch()
  }

  // Equal filters give equal strings (canonical order, no empty params). Excludes the event id,
  // so opening an event does not scroll the list back to the top.
  const resetKey = serializeExplorerParams({ filters, eventId: null }).toString()

  const timeRangeActive = hasTimeRange(filters)
  const activeFilterCount =
    (filters.q.trim() !== '' ? 1 : 0) +
    (filters.agents.length > 0 ? 1 : 0) +
    (filters.status !== null ? 1 : 0) +
    (timeRangeActive ? 1 : 0)

  let listContent: ReactNode
  if (list.isError && rows.length === 0) {
    listContent = (
      <ErrorState
        error={list.error}
        onRetry={retryList}
        retrying={list.isFetching}
        headingLevel={2}
      />
    )
  } else if (list.isSuccess && !list.isPlaceholderData && rows.length === 0) {
    listContent = hasActiveFilters(filters) ? (
      <EmptyState
        headingLevel={2}
        title="No events match your filters"
        description={describeEmpty(filters, newestTime.data)}
        actions={
          <>
            <Button variant="primary" onClick={clearAllFromEmpty}>
              Clear all filters
            </Button>
            {/* With several filters, offer to loosen just the most likely culprit. A narrow time
                window comes first: a preset or shared link outside the data span empties any
                combination of the other filters. */}
            {activeFilterCount > 1 && timeRangeActive && (
              <Button onClick={() => setTimeRange({ from: null, to: null })}>
                Remove time range
              </Button>
            )}
            {activeFilterCount > 1 && !timeRangeActive && filters.status !== null && (
              <Button onClick={() => setStatus(null)}>Remove status filter</Button>
            )}
            {activeFilterCount > 1 &&
              !timeRangeActive &&
              filters.status === null &&
              filters.q.trim() !== '' && (
                <Button
                  onClick={() => {
                    setQuery('', { replace: false })
                    focusSearch()
                  }}
                >
                  Clear search
                </Button>
              )}
          </>
        }
      />
    ) : (
      <EmptyState
        headingLevel={2}
        icon={<InboxIcon size={40} strokeWidth={1.6} />}
        title="No events yet"
        description="Tool calls will appear here as your agents make them."
      />
    )
  } else {
    listContent = (
      <EventTable
        ref={tableRef}
        rows={rows}
        total={total}
        selectedId={eventId}
        isInitialLoading={list.isPending}
        isStale={list.isPlaceholderData}
        hasNextPage={list.hasNextPage}
        isFetchingNextPage={list.isFetchingNextPage}
        isFetchNextPageError={list.isFetchNextPageError}
        nextPageError={list.error}
        onLoadMore={loadMore}
        onOpen={openFromList}
        resetKey={resetKey}
      />
    )
  }

  const panel =
    eventId === null ? null : (
      <DetailPanel
        eventId={eventId}
        summary={openSummary}
        docked={docked}
        onClose={closeEvent}
        onPrev={prevRow ? goPrev : undefined}
        onNext={nextRow ? goNext : undefined}
        expanded={panelWidth.expanded}
        onToggleExpanded={panelWidth.toggleExpanded}
        id={DETAIL_PANEL_ID}
      />
    )

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <AppHeader
        onOpenShortcuts={() => setShortcutsOpen(true)}
        actions={
          <LiveToggle on={liveOn} status={live.status} onToggle={() => setLiveOn((on) => !on)} />
        }
      />
      <Toolbar
        filters={filters}
        onQueryChange={setQuery}
        onAgentsChange={setAgents}
        onStatusChange={setStatus}
        onTimeRangeChange={setTimeRange}
        onClearFilters={clearFilters}
        total={total}
        loadedCount={rows.length}
        // Placeholder rows belong to the previous filters: the count dims until the new ones land.
        isLoading={list.isPending || list.isPlaceholderData}
        searchInputRef={searchInputRef}
      />
      {/* Carries the docked panel's width as a CSS variable, which ResizeHandle rewrites while
          dragging without re-rendering this page. */}
      <div
        ref={layoutRef}
        style={panelWidthStyle(panelWidth.width)}
        className="flex min-h-0 flex-1"
      >
        <main className="flex min-w-0 flex-1 flex-col px-4 pt-4 md:px-6">
          {listSlow && <SlowNotice onRetry={retrySlow} className="mb-3 shrink-0" />}
          <div className="relative flex min-h-0 flex-1 flex-col" ref={listAreaRef}>
            {/* Always mounted so its live region can announce; shows nothing while live is off. */}
            <NewEventsPill
              count={liveOn ? live.pendingCount : 0}
              needsRefresh={liveOn && live.needsRefresh}
              refreshing={live.refreshing}
              failed={liveOn && live.refreshFailed}
              onShow={showNewEvents}
            />
            {listContent}
          </div>
        </main>
        {docked && panel && (
          <ResizeHandle
            width={panelWidth.width}
            minWidth={panelWidth.minWidth}
            maxWidth={panelWidth.maxWidth}
            onResize={panelWidth.setWidth}
            onReset={panelWidth.reset}
            targetRef={layoutRef}
            controls={DETAIL_PANEL_ID}
          />
        )}
        {docked && panel}
      </div>
      {!docked && panel}
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
