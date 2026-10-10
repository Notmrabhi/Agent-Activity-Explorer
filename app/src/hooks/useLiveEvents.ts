import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { queryKeys } from '../api/queryKeys'
import type { EventFilters, EventsPage, EventSummary } from '../api/types'
import { canMergeLocally, matchesFilters, prependEvents } from '../lib/live'
import { useLiveStream, type LiveStatus } from './useLiveStream'

/** Beyond this many waiting events, showing them reloads the first page instead. */
const MAX_PENDING = 500

type ListData = InfiniteData<EventsPage, string | null>

export interface LiveEvents {
  status: LiveStatus
  /** Matching events waiting to be shown. */
  pendingCount: number
  /** With a search active (or too many waiting), showing them reloads the first page. */
  needsRefresh: boolean
  /** Show the waiting events (merge them in, or reload the first page). Resolves when visible. */
  showPending: () => Promise<void>
}

/**
 * Live mode for the event list. New events are only inserted straight away when `canInsertNow`
 * says the reader won't be disturbed (top of the list, not pointing at or focused in it);
 * otherwise they wait until the user asks for them.
 */
export function useLiveEvents(enabled: boolean, filters: EventFilters, canInsertNow: () => boolean): LiveEvents {
  const queryClient = useQueryClient()
  const keyString = JSON.stringify(queryKeys.events(filters))
  const [pending, setPending] = useState<EventSummary[]>([])
  const [overflow, setOverflow] = useState(false)

  // Waiting events belong to one set of filters; new filters fetch fresh data anyway.
  const [pendingFor, setPendingFor] = useState(keyString)
  if (pendingFor !== keyString) {
    setPendingFor(keyString)
    setPending([])
    setOverflow(false)
  }

  const local = canMergeLocally(filters)

  const status = useLiveStream(enabled, (event) => {
    if (!matchesFilters(event, filters)) return
    if (local && !overflow && pending.length === 0 && canInsertNow()) {
      queryClient.setQueryData<ListData>(queryKeys.events(filters), (data) => prependEvents(data, [event]))
      return
    }
    if (pending.length >= MAX_PENDING) setOverflow(true)
    setPending((current) =>
      current.some((item) => item.id === event.id) ? current : [...current, event].slice(-MAX_PENDING),
    )
  })

  const showPending = useCallback(async () => {
    const key = queryKeys.events(filters)
    if (local && !overflow) {
      queryClient.setQueryData<ListData>(key, (data) => prependEvents(data, pending))
    } else {
      // Keep only the first page, then refetch it: the server applies the search exactly.
      queryClient.setQueryData<ListData>(key, (data) =>
        data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
      )
      await queryClient.refetchQueries({ queryKey: key, exact: true })
    }
    setPending([])
    setOverflow(false)
  }, [queryClient, filters, local, overflow, pending])

  return {
    status,
    pendingCount: pending.length,
    needsRefresh: !local || overflow,
    showPending,
  }
}
