import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useQueries,
  useQuery,
} from '@tanstack/react-query'
import { useMemo, useState } from 'react'
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
  agentRow,
  BUCKET_MS,
  compareAgentRows,
  bucketReady,
  chooseBucket,
  fillGaps,
  mergeStatusHistograms,
  type AgentRow,
} from '../lib/histogram'
import { createLimiter } from '../lib/limiter'

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

export type AgentItem =
  /** Loaded for the current filters. */
  | { agent: string; state: 'ready'; row: AgentRow }
  /** Still loading; `row` is the previous result, shown dimmed, or null the first time. */
  | { agent: string; state: 'loading'; row: AgentRow | null }
  /** Failed after retries; the other agents are not affected. */
  | { agent: string; state: 'error'; row: AgentRow | null; retry: () => void }

/** Agent requests run 4 at a time, so they never crowd out anything more urgent. */
const agentLimiter = createLimiter(4)

/**
 * Events per agent for the current filters: two requests per agent (all its events, and its
 * errors; one when a status filter already decides the errors), because the API has no group-by.
 * Requests go through a small queue. Each agent's row appears as soon as its own requests finish,
 * the previous rows stay (marked as updating) while new filters load, and one failing agent never
 * blocks the others. `axis` (the main chart's buckets) gives every trend line the same time axis.
 */
export function useAgentBreakdown(
  filters: EventFilters,
  agents: readonly string[],
  bucket: HistogramBucketSize,
  enabled: boolean,
  axis: readonly { t: string }[],
) {
  const names = filters.agents.length > 0 ? filters.agents : agents
  const needErrors = filters.status === null
  const requests = names.flatMap((agent) => [
    { agent, kind: 'all' as const, filters: { ...filters, agents: [agent] } },
    ...(needErrors
      ? [
          {
            agent,
            kind: 'errors' as const,
            filters: { ...filters, agents: [agent], status: 'error' as const },
          },
        ]
      : []),
  ])
  const current = useQueries({
    queries: requests.map((request) => ({
      queryKey: queryKeys.histogram(request.filters, bucket),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        agentLimiter(() => fetchHistogram(request.filters, bucket, signal), signal),
      staleTime: 60_000,
      enabled: enabled && names.length > 0,
    })),
    combine: (results) => {
      const byAgent = new Map<
        string,
        { row: AgentRow | null; failed: boolean; key: string; retry: () => void }
      >()
      for (const agent of names) {
        const mine = requests.flatMap((request, i) =>
          request.agent === agent ? [{ request, result: results[i] }] : [],
        )
        const loaded = mine.every(({ result }) => result?.data !== undefined)
        let row: AgentRow | null = null
        if (loaded) {
          const all =
            mine.find(({ request }) => request.kind === 'all')?.result?.data?.buckets ?? []
          const errors = mine.find(({ request }) => request.kind === 'errors')?.result?.data
            ?.buckets
          const ownAxis = fillGaps(all, BUCKET_MS[bucket])
          row = agentRow(
            agent,
            all,
            errors ?? null,
            filters.status === 'error',
            axis.length > 0 ? axis : ownAxis,
          )
        }
        byAgent.set(agent, {
          row,
          failed: !loaded && mine.some(({ result }) => result?.isError),
          key: mine.map(({ result }) => result?.dataUpdatedAt ?? 0).join(),
          retry: () => {
            for (const { result } of mine) if (result?.isError) void result.refetch()
          },
        })
      }
      return byAgent
    },
  })

  // The last complete set of rows, shown dimmed for agents whose new data hasn't arrived yet.
  // Adjusted during render (React's pattern for state derived from changing data).
  const [remembered, setRemembered] = useState<{
    key: string
    rows: ReadonlyMap<string, AgentRow>
  }>({ key: '', rows: new Map() })
  const complete = names.length > 0 && names.every((agent) => current.get(agent)?.row)
  const completeKey = complete ? names.map((agent) => current.get(agent)?.key).join('|') : ''
  if (complete && completeKey !== remembered.key) {
    const rows = new Map<string, AgentRow>()
    for (const agent of names) {
      const row = current.get(agent)?.row
      if (row) rows.set(agent, row)
    }
    setRemembered({ key: completeKey, rows })
  }

  const items: AgentItem[] = names.map((agent) => {
    const entry = current.get(agent)
    if (entry?.row) return { agent, state: 'ready', row: entry.row }
    const previous = remembered.rows.get(agent) ?? null
    if (entry?.failed) return { agent, state: 'error', row: previous, retry: entry.retry }
    return { agent, state: 'loading', row: previous }
  })
  // Rows with numbers (fresh or previous) in table order; agents with nothing yet go last.
  items.sort((a, b) => {
    if (a.row && b.row) return compareAgentRows(a.row, b.row)
    if (a.row) return -1
    if (b.row) return 1
    return a.agent.localeCompare(b.agent)
  })

  return {
    items,
    isPending: items.some((item) => item.state === 'loading'),
    allFailed: items.length > 0 && items.every((item) => item.state === 'error'),
    retryAll: () => {
      for (const item of items) if (item.state === 'error') item.retry()
    },
  }
}
