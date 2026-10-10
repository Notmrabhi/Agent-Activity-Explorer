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

/** e.g. Nothing for “stripe” from devops with status Error between Oct 09 11:00 and 12:00 UTC. */
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

/** View state from the URL, server state from TanStack Query; this page wires them together. */
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
  const newestTime = useNewestEventTime()
  const { rows, total } = list
  const docked = useMediaQuery(DOCKED_PANEL_QUERY)
  const listSlow = useSlowFlag(list.isFetching)
  const panelWidth = usePanelWidth()

  const tableRef = useRef<EventTableHandle>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // Live events go straight in only at the top with no pointer or focus in the list; otherwise
  // they wait behind the pill.
  const [liveOn, setLiveOn] = useState(false)
  // :hover, because pointerenter/leave can miss a transition.
  const listAreaRef = useRef<HTMLDivElement>(null)
  const canInsertNow = useCallback(() => {
    if (listAreaRef.current?.matches(':hover')) return false
    if (document.activeElement?.closest('[role="grid"]')) return false
    return tableRef.current?.isAtTop() ?? true
  }, [])
  const live = useLiveEvents(liveOn, filters, canInsertNow)
  const revealNewestRef = useRef(false)
  const { showPending } = live
  const showNewEvents = useCallback(() => {
    revealNewestRef.current = true
    void showPending().then((shown) => {
      if (!shown) revealNewestRef.current = false
    })
  }, [showPending])

  const indexById = useMemo(() => new Map(rows.map((row, index) => [row.id, index])), [rows])
  const openIndex = eventId === null ? undefined : indexById.get(eventId)
  const openSummary: EventSummary | undefined =
    openIndex === undefined ? undefined : rows[openIndex]
  const prevRow = openIndex === undefined ? undefined : rows[openIndex - 1]
  const nextRow = openIndex === undefined ? undefined : rows[openIndex + 1]

  // `eventId` lags a render behind a fast J/K burst (router transition), so steps start from the
  // newest id we asked for, not the lagging one.
  const requestedIdsRef = useRef<string[]>([])
  // The newest step asked for: a fast "kkk Esc" must return focus to the row the user reached.
  const lastOpenIdRef = useRef(eventId)
  useLayoutEffect(() => {
    const requested = requestedIdsRef.current
    const position = eventId === null ? -1 : requested.indexOf(eventId)
    requestedIdsRef.current = position === -1 ? [] : requested.slice(position + 1)
    if (eventId !== null) lastOpenIdRef.current = requestedIdsRef.current.at(-1) ?? eventId
  }, [eventId])

  // After the pill is clicked, focus the newest row so keyboard users don't land on <body>.
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
      openEvent(target.id, { replace: true })
    },
    [eventId, indexById, rows, openEvent],
  )
  const goPrev = useCallback(() => step(-1), [step])
  const goNext = useCallback(() => step(1), [step])

  // Recorded like `step`, so "click row B, Esc" doesn't return focus to the previous row.
  const openFromList = useCallback(
    (id: string, options: { replace?: boolean }) => {
      requestedIdsRef.current = []
      lastOpenIdRef.current = id
      openEvent(id, options)
    },
    [openEvent],
  )

  // Panel closed: focus the row that was open, unless the user already moved focus elsewhere.
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

  // Same query key as the panel, so no extra request.
  const detail = useEventDetail(eventId)
  const openHead = openSummary ?? detail.data
  useEffect(() => {
    document.title = openHead ? `${openHead.tool} · ${openHead.agent} — ${APP_TITLE}` : APP_TITLE
  }, [openHead])

  // "/" search, "?" shortcuts, J/K with the panel open. Ignored in fields, other dialogs, or when
  // already handled.
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

  const { refetch, fetchNextPage } = list
  const retryList = useCallback(() => {
    void refetch()
  }, [refetch])
  // cancelRefetch aborts the slow request instead of queueing behind it.
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
    // The button unmounts; keep focus off <body>.
    focusSearch()
  }

  // Excludes the event id, so opening an event doesn't scroll the list to the top.
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
            {/* Several filters: offer to remove the most likely culprit, time range first. */}
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
        isLoading={list.isPending || list.isPlaceholderData}
        searchInputRef={searchInputRef}
      />
      {/* Panel width as a CSS variable: ResizeHandle changes it without re-rendering the page. */}
      <div
        ref={layoutRef}
        style={panelWidthStyle(panelWidth.width)}
        className="flex min-h-0 flex-1"
      >
        <main className="flex min-w-0 flex-1 flex-col px-4 pt-4 md:px-6">
          {listSlow && <SlowNotice onRetry={retrySlow} className="mb-3 shrink-0" />}
          <div className="relative flex min-h-0 flex-1 flex-col" ref={listAreaRef}>
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
