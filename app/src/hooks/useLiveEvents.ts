import { useIsFetching, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fetchEventsPage } from '../api/events'
import { queryKeys } from '../api/queryKeys'
import type { EventFilters, EventsPage, EventSummary } from '../api/types'
import {
  canMergeLocally,
  hasGap,
  matchesFilters,
  prependEvents,
  unseenEvents,
  type ListData,
} from '../lib/live'
import { retryDelay, shouldRetry } from '../lib/queryClient'
import { useLiveStream, type LiveStatus } from './useLiveStream'

/** Beyond this many waiting events, showing them reloads the first page instead. */
const MAX_PENDING = 500

/** With a search active, how often the server is asked for new matches while events arrive. */
const SEARCH_CHECK_MS = 3000

/** Stream events arriving within this window are added to the list together. */
const BATCH_MS = 250

export interface LiveEvents {
  status: LiveStatus
  /** New events waiting to be shown. */
  pendingCount: number
  /** Too many (or an unknown number of) events waiting: showing them reloads the first page. */
  needsRefresh: boolean
  /** The first page is being reloaded for the pill. */
  refreshing: boolean
  /** The last reload failed; the events are still waiting. */
  refreshFailed: boolean
  /** Show the waiting events. Resolves to false when that failed and they are still waiting. */
  showPending: () => Promise<boolean>
}

/** Events waiting behind the pill. `view` ties them to one live session and set of filters. */
interface Waiting {
  view: string
  events: EventSummary[]
  overflow: boolean
}

function addWaiting(
  state: Waiting,
  view: string,
  events: EventSummary[],
  overflow = false,
): Waiting {
  const base = state.view === view ? state : { view, events: [], overflow: false }
  if (base.overflow || overflow) return { view, events: [], overflow: true }
  const ids = new Set(base.events.map((event) => event.id))
  const added = events.filter((event) => !ids.has(event.id))
  if (added.length === 0) return base
  const all = [...base.events, ...added]
  return all.length > MAX_PENDING
    ? { view, events: [], overflow: true }
    : { view, events: all, overflow: false }
}

/** The newest page for `filters`, always from the server (fetchQuery doesn't retry by default). */
function fetchHead(queryClient: QueryClient, filters: EventFilters): Promise<EventsPage> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.eventsHead(filters),
    queryFn: ({ signal }) => fetchEventsPage(filters, null, signal),
    staleTime: 0,
    retry: shouldRetry,
    retryDelay,
  })
}

/**
 * Live mode for the event list. New events are only inserted straight away when `canInsertNow`
 * says the reader won't be disturbed (top of the list, not pointing at or focused in it);
 * otherwise they wait until the user asks for them.
 *
 * - The list cache is never written while one of its requests is in flight: TanStack would
 *   overwrite the write with the pages that request started from. Events that arrive meanwhile
 *   are held and merged once it settles; showing waiting events cancels the request first.
 * - The stream doesn't replay what was missed while it was down, off, or showing other filters,
 *   so on every (re)connect and filter change the first page is fetched and merged. With a
 *   search active the server is asked the same way, since only it can match the search.
 */
export function useLiveEvents(
  enabled: boolean,
  filters: EventFilters,
  canInsertNow: () => boolean,
): LiveEvents {
  const queryClient = useQueryClient()
  const listKey = queryKeys.events(filters)
  const keyString = JSON.stringify(listKey)

  // Each time live mode is turned on starts with nothing waiting: what was missed is fetched.
  const [session, setSession] = useState(0)
  const [wasEnabled, setWasEnabled] = useState(enabled)
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled)
    if (enabled) setSession((n) => n + 1)
  }
  const view = `${session}:${keyString}`
  const viewRef = useRef(view)
  useLayoutEffect(() => {
    viewRef.current = view
  })

  // The ref is the source of truth (a burst of messages arrives between renders).
  const waitingRef = useRef<Waiting>({ view, events: [], overflow: false })
  const [waiting, setWaiting] = useState<Waiting>({ view, events: [], overflow: false })
  const updateWaiting = useCallback((next: Waiting) => {
    waitingRef.current = next
    setWaiting(next)
  }, [])
  // Events that would have gone straight in while the list had no data or a request in flight.
  const heldRef = useRef<{ view: string; events: EventSummary[] }>({ view, events: [] })
  const [refreshing, setRefreshing] = useState(false)
  const [failedView, setFailedView] = useState<string | null>(null)

  // The handlers below read this render's values; timers and awaits reach the latest ones
  // through `handlers`.
  const listBusy = () => queryClient.isFetching({ queryKey: listKey, exact: true }) > 0
  const nothingWaiting = () => {
    const current = waitingRef.current
    return current.view !== view || (current.events.length === 0 && !current.overflow)
  }

  // `forView` guards against answers that land after the filters changed or live was turned off.
  const receive = (forView: string, events: EventSummary[]) => {
    if (!enabled || forView !== view || events.length === 0) return
    const data = queryClient.getQueryData<ListData>(listKey)
    const fresh = data ? unseenEvents(data, events) : events
    if (fresh.length === 0) return
    if (data && !(nothingWaiting() && canInsertNow())) {
      updateWaiting(addWaiting(waitingRef.current, view, fresh))
    } else if (!data || listBusy()) {
      // Would go straight in, but the list is loading: hold them until it settles.
      const held = heldRef.current.view === view ? heldRef.current.events : []
      heldRef.current = { view, events: [...held, ...fresh] }
      if (heldRef.current.events.length > MAX_PENDING) {
        heldRef.current = { view, events: [] }
        updateWaiting(addWaiting(waitingRef.current, view, [], true))
      }
    } else {
      queryClient.setQueryData<ListData>(listKey, (old) => prependEvents(old, fresh))
    }
  }

  const applyHead = (
    forView: string,
    newest: EventSummary | undefined,
    head: EventsPage | null,
  ) => {
    if (!enabled || forView !== view) return
    const data = queryClient.getQueryData<ListData>(listKey)
    if (!data) return
    if (head && !hasGap(newest, head)) {
      receive(view, head.items)
      return
    }
    // Too many new events to merge (or the check failed): reload the first page, right away
    // only if no one is reading.
    if (head && nothingWaiting() && canInsertNow() && !listBusy()) {
      queryClient.setQueryData<ListData>(listKey, { pages: [head], pageParams: [null] })
    } else {
      updateWaiting(addWaiting(waitingRef.current, view, [], true))
    }
  }

  const catchUp = async () => {
    const forView = view
    // While the list is loading for the first time, that request is already up to date.
    const data = queryClient.getQueryData<ListData>(listKey)
    if (!data) return
    const newest = data.pages[0]?.items[0]
    let head: EventsPage | null = null
    try {
      head = await fetchHead(queryClient, filters)
    } catch {
      // Unknown what was missed: offer a reload.
    }
    handlers.current.applyHead(forView, newest, head)
  }

  const flushHeld = () => {
    const held = heldRef.current
    if (held.view !== view || held.events.length === 0 || !queryClient.getQueryData(listKey)) return
    heldRef.current = { view, events: [] }
    receive(view, held.events)
  }

  const handlers = useRef({ applyHead, catchUp, flushHeld, receive })
  useLayoutEffect(() => {
    handlers.current = { applyHead, catchUp, flushHeld, receive }
  })

  const checkTimerRef = useRef(0)
  // Stream events are collected and added once per BATCH_MS: one list update instead of one per event.
  const batchRef = useRef<{ view: string; events: EventSummary[]; timer: number }>({
    view,
    events: [],
    timer: 0,
  })
  useEffect(
    () => () => {
      window.clearTimeout(checkTimerRef.current)
      checkTimerRef.current = 0
      window.clearTimeout(batchRef.current.timer)
      batchRef.current = { view: '', events: [], timer: 0 }
    },
    [view],
  )

  const status = useLiveStream(
    enabled,
    (event) => {
      if (!matchesFilters(event, filters)) return
      if (canMergeLocally(filters)) {
        const batch = batchRef.current
        if (batch.view !== view) batchRef.current = { view, events: [], timer: 0 }
        batchRef.current.events.push(event)
        if (batchRef.current.timer === 0) {
          batchRef.current.timer = window.setTimeout(() => {
            const { view: forView, events } = batchRef.current
            batchRef.current = { view: forView, events: [], timer: 0 }
            handlers.current.receive(forView, events)
          }, BATCH_MS)
        }
      } else if (checkTimerRef.current === 0) {
        checkTimerRef.current = window.setTimeout(() => {
          checkTimerRef.current = 0
          void handlers.current.catchUp()
        }, SEARCH_CHECK_MS)
      }
    },
    () => void catchUp(),
  )

  // Coming back to (or switching to) a list cached while live: it missed what arrived meanwhile.
  const lastKeyRef = useRef(keyString)
  useEffect(() => {
    if (lastKeyRef.current === keyString) return
    lastKeyRef.current = keyString
    if (enabled) void handlers.current.catchUp()
  }, [keyString, enabled])

  // Merge held events once the list's request has settled.
  const fetching = useIsFetching({ queryKey: listKey, exact: true })
  useEffect(() => {
    if (fetching === 0) handlers.current.flushHeld()
  }, [fetching, view])

  const showPending = useCallback(async (): Promise<boolean> => {
    const listKey = queryKeys.events(filters)
    const cancel = () => queryClient.cancelQueries({ queryKey: listKey, exact: true })
    let head: EventsPage | null = null
    if (waitingRef.current.view === view && waitingRef.current.overflow) {
      setRefreshing(true)
      try {
        head = await fetchHead(queryClient, filters)
      } catch {
        setFailedView(view)
        return false
      } finally {
        setRefreshing(false)
      }
    }
    // A request in flight would overwrite the merge with the pages it started from.
    await cancel()
    if (viewRef.current !== view) return false
    // Read after the awaits: events keep arriving meanwhile.
    const waitingNow = waitingRef.current.view === view ? waitingRef.current.events : []
    const held = heldRef.current.view === view ? heldRef.current.events : []
    const base = head ? { pages: [head], pageParams: [null] } : undefined
    queryClient.setQueryData<ListData>(listKey, (data) =>
      prependEvents(base ?? data, [...held, ...waitingNow]),
    )
    heldRef.current = { view, events: [] }
    updateWaiting({ view, events: [], overflow: false })
    setFailedView(null)
    // Events that arrived during the reload were dropped with the overflow: fetch them again.
    if (head) void handlers.current.catchUp()
    return true
  }, [queryClient, view, filters, updateWaiting])

  const visible = waiting.view === view ? waiting : null
  return {
    status,
    pendingCount: visible?.events.length ?? 0,
    needsRefresh: visible?.overflow ?? false,
    refreshing,
    refreshFailed: failedView === view,
    showPending,
  }
}
