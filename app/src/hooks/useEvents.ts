import { keepPreviousData, skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchAgents, fetchEvent, fetchEventsPage, fetchNewestEvent } from '../api/events'
import { queryKeys } from '../api/queryKeys'
import type { EventFilters, EventSummary } from '../api/types'

/**
 * The event list as an infinite (cursor-paginated) query.
 *
 * - The query key contains the filters, so a filter change starts a fresh list and TanStack
 *   aborts the old request via its AbortSignal: a slow stale response can never win the race.
 * - `keepPreviousData` keeps the old rows on screen (dimmed) while the new filters load,
 *   instead of flashing an empty table.
 * - `staleTime: Infinity`: refetching a stale infinite query re-requests *every* loaded page in
 *   sequence (could be 100+ requests against an API that fails ~7% of the time), so we never
 *   refetch automatically. Data refreshes on reload or when the filters change.
 */
export function useEventList(filters: EventFilters) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.events(filters),
    queryFn: ({ pageParam, signal }) => fetchEventsPage(filters, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })

  const rows = useMemo<EventSummary[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )
  const total = query.data?.pages[0]?.total ?? null

  return { ...query, rows, total }
}

/** Full event for the detail panel. Events are immutable, so cached details never go stale. */
export function useEventDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.event(id ?? ''),
    queryFn: id ? ({ signal }) => fetchEvent(id, signal) : skipToken,
    staleTime: Infinity,
  })
}

/** Agent names for the filter. Fetched once per session. */
export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents(),
    queryFn: ({ signal }) => fetchAgents(signal),
    staleTime: Infinity,
  })
}

/**
 * Timestamp of the newest event (null when there are none): the anchor quick time ranges count
 * back from. Re-read after a minute, since new events keep arriving and "last 15 minutes" should
 * include them.
 */
export function useNewestEventTime() {
  return useQuery({
    queryKey: queryKeys.newestEvent(),
    queryFn: ({ signal }) => fetchNewestEvent(signal),
    select: (event) => event?.timestamp ?? null,
    staleTime: 60_000,
  })
}
