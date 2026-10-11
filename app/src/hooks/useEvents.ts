import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useQueries,
  useQuery,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  fetchAgents,
  fetchEvent,
  fetchEventsPage,
  fetchHistogram,
  fetchNewestEvent,
} from '../api/events'
import { queryKeys } from '../api/queryKeys'
import {
  EVENT_STATUSES,
  type EventFilters,
  type EventStatus,
  type EventSummary,
  type HistogramBucket,
  type HistogramBucketSize,
} from '../api/types'
import {
  agentRows,
  BUCKET_MS,
  bucketReady,
  chooseBucket,
  mergeStatusHistograms,
  type AgentRow,
  type StatusBucket,
} from '../lib/histogram'

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

/**
 * Counts per bucket and status for the current filters: one request per status (only the
 * filtered one when a status filter is set), merged onto one even time axis.
 */
export function useStatusHistogram(
  filters: EventFilters,
  newestIso: string | null | undefined,
  options: { enabled?: boolean; bucket?: HistogramBucketSize } = {},
) {
  const bucket = options.bucket ?? chooseBucket(filters, newestIso)
  const enabled = (options.enabled ?? true) && bucketReady(filters, newestIso)
  const statuses = filters.status === null ? EVENT_STATUSES : [filters.status]
  return useQueries({
    queries: statuses.map((status) => {
      const statusFilters = { ...filters, status }
      return {
        queryKey: queryKeys.histogram(statusFilters, bucket),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchHistogram(statusFilters, bucket, signal),
        placeholderData: keepPreviousData,
        staleTime: 60_000,
        enabled,
      }
    }),
    combine: (results) => {
      const allLoaded = results.every((result) => result.data !== undefined)
      const byStatus: Partial<Record<EventStatus, HistogramBucket[]>> = {}
      statuses.forEach((status, i) => {
        byStatus[status] = results[i]?.data?.buckets ?? []
      })
      const size = results[0]?.data?.bucket ?? bucket
      return {
        bucket: size,
        buckets: allLoaded ? mergeStatusHistograms(byStatus, BUCKET_MS[size]) : [],
        isPending: !allLoaded && results.some((result) => result.isPending),
        isError: !allLoaded && results.some((result) => result.isError),
        isStale: results.some((result) => result.isPlaceholderData),
        isFetching: results.some((result) => result.isFetching),
        updatedAt: Math.max(0, ...results.map((result) => result.dataUpdatedAt)),
        refetch: () => {
          for (const result of results) if (result.isError) void result.refetch()
        },
      }
    },
  })
}

/**
 * Events per agent and status for the current filters: one request per agent and status (only the
 * filtered agents and status when those filters are set), on one shared time axis.
 */
export function useAgentBreakdown(
  filters: EventFilters,
  agents: readonly string[],
  bucket: HistogramBucketSize,
  enabled: boolean,
) {
  const names = filters.agents.length > 0 ? filters.agents : agents
  const statuses = filters.status === null ? EVENT_STATUSES : [filters.status]
  const pairs = names.flatMap((agent) => statuses.map((status) => ({ agent, status })))
  return useQueries({
    queries: pairs.map(({ agent, status }) => {
      const pairFilters = { ...filters, agents: [agent], status }
      return {
        queryKey: queryKeys.histogram(pairFilters, bucket),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchHistogram(pairFilters, bucket, signal),
        placeholderData: keepPreviousData,
        staleTime: 60_000,
        enabled: enabled && names.length > 0,
      }
    }),
    combine: (results) => {
      const allLoaded = results.length > 0 && results.every((result) => result.data !== undefined)
      let rows: AgentRow[] = []
      if (allLoaded) {
        const axis = results.flatMap((result) => result.data?.buckets ?? [])
        const byAgent = new Map<string, StatusBucket[]>()
        for (const agent of names) {
          const byStatus: Partial<Record<EventStatus, HistogramBucket[]>> = {}
          pairs.forEach((pair, i) => {
            if (pair.agent === agent) byStatus[pair.status] = results[i]?.data?.buckets ?? []
          })
          byAgent.set(agent, mergeStatusHistograms(byStatus, BUCKET_MS[bucket], axis))
        }
        rows = agentRows(byAgent)
      }
      return {
        rows,
        isPending: !allLoaded && results.some((result) => result.isPending),
        isError: !allLoaded && results.some((result) => result.isError),
        isStale: results.some((result) => result.isPlaceholderData),
        refetch: () => {
          for (const result of results) if (result.isError) void result.refetch()
        },
      }
    },
  })
}
