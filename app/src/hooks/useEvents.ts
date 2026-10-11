import { keepPreviousData, skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  fetchAgents,
  fetchEvent,
  fetchEventsPage,
  fetchHistogram,
  fetchNewestEvent,
} from '../api/events'
import { queryKeys } from '../api/queryKeys'
import type { EventFilters, EventSummary } from '../api/types'
import { BUCKET_MS, chooseBucket, fillGaps } from '../lib/histogram'

/**
 * Filters are in the key, so a filter change aborts the old request. staleTime Infinity: a refetch
 * would re-request every loaded page against an API that fails ~7% of the time.
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

/** Events are immutable, so cached details never go stale. */
export function useEventDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.event(id ?? ''),
    queryFn: id ? ({ signal }) => fetchEvent(id, signal) : skipToken,
    staleTime: Infinity,
  })
}

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents(),
    queryFn: ({ signal }) => fetchAgents(signal),
    staleTime: Infinity,
  })
}

/** The anchor quick time ranges count back from. */
export function useNewestEventTime() {
  return useQuery({
    queryKey: queryKeys.newestEvent(),
    queryFn: ({ signal }) => fetchNewestEvent(signal),
    select: (event) => event?.timestamp ?? null,
    staleTime: 60_000,
  })
}

/** Counts per bucket for the current filters, with empty buckets filled in. */
export function useHistogram(filters: EventFilters, newestIso: string | null | undefined) {
  const bucket = chooseBucket(filters, newestIso)
  const query = useQuery({
    queryKey: queryKeys.histogram(filters, bucket),
    queryFn: ({ signal }) => fetchHistogram(filters, bucket, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
  const buckets = useMemo(
    () => (query.data ? fillGaps(query.data.buckets, BUCKET_MS[query.data.bucket]) : []),
    [query.data],
  )
  return { ...query, bucket: query.data?.bucket ?? bucket, buckets }
}
