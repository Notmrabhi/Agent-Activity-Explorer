import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import type { EventFilters } from '../api/types'
import { EventsChart } from '../components/Chart/EventsChart'
import { EmptyState } from '../components/feedback/EmptyState'
import { ErrorState } from '../components/feedback/ErrorState'
import { SlowNotice } from '../components/feedback/SlowNotice'
import { AppHeader } from '../components/Header/AppHeader'
import { AgentTable } from '../components/Overview/AgentTable'
import { HealthCards } from '../components/Overview/HealthCards'
import { ShortcutsDialog } from '../components/ShortcutsDialog'
import { Toolbar } from '../components/Toolbar/Toolbar'
import { Button } from '../components/ui/Button'
import {
  useAgentBreakdown,
  useAgents,
  useNewestEventTime,
  useStatusHistogram,
} from '../hooks/useEvents'
import { useExplorerUrlState } from '../hooks/useExplorerUrlState'
import { useInView } from '../hooks/useInView'
import { useSlowFlag } from '../hooks/useSlowFlag'
import { bucketReady, previousRange, sumStatuses } from '../lib/histogram'
import { hasActiveFilters, serializeExplorerParams } from '../lib/urlState'

/** "6 h", "45 min", "2 d": the length of the compared periods. */
function formatPeriod(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 120) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} d`
}

const eventsHref = (filters: EventFilters) => {
  const search = serializeExplorerParams({ filters, eventId: null }).toString()
  return search ? `/?${search}` : '/'
}

/**
 * Overview: is something wrong, when did it start, which agent. Every card and agent drills into
 * the Events view with the same filters, so the URL stays the one source of truth.
 */
export default function OverviewPage() {
  const { filters, setQuery, setAgents, setStatus, setTimeRange, clearFilters } =
    useExplorerUrlState()
  const queryClient = useQueryClient()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const newest = useNewestEventTime()
  const status = useStatusHistogram(filters, newest.data)

  // The period of the same length just before, for "vs previous 6 h". Needs a start; an open end
  // runs to the newest event.
  const end = filters.to ?? newest.data ?? null
  const previous = previousRange(filters.from, end)
  const previousStatus = useStatusHistogram(
    { ...filters, from: previous?.from ?? null, to: previous?.to ?? null },
    newest.data,
    { enabled: previous !== null, bucket: status.bucket },
  )

  const agents = useAgents()
  const [agentsRef, agentsInView] = useInView<HTMLDivElement>()
  const breakdown = useAgentBreakdown(
    filters,
    agents.data ?? [],
    status.bucket,
    // Only once the table is on screen, and after the cards and chart: the browser runs ~6
    // requests at a time, and the agent requests would otherwise queue ahead of the 3 that
    // answer "is something wrong?".
    agentsInView && bucketReady(filters, newest.data) && !status.isPending,
    status.buckets,
  )

  const totals = status.isPending ? null : sumStatuses(status.buckets)
  const previousTotals =
    previous && !previousStatus.isPending ? sumStatuses(previousStatus.buckets) : null
  const periodLabel =
    previous && filters.from ? formatPeriod(Date.parse(end ?? '') - Date.parse(filters.from)) : null

  const slow = useSlowFlag(status.isFetching)
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['histogram'] })
    void queryClient.invalidateQueries({ queryKey: ['newest-event'] })
  }, [queryClient])

  const updated = status.updatedAt
    ? new Date(status.updatedAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  let content
  if (status.isError && !totals) {
    content = (
      <ErrorState
        error={undefined}
        title="Couldn’t load the overview"
        message="The activity service didn’t answer after retrying. The Events view may still work."
        onRetry={status.refetch}
        headingLevel={2}
      />
    )
  } else if (totals && totals.total === 0) {
    content = (
      <EmptyState
        headingLevel={2}
        title={hasActiveFilters(filters) ? 'No events match your filters' : 'No events yet'}
        description="There is nothing to summarise for this view."
        actions={
          hasActiveFilters(filters) && (
            <Button variant="primary" onClick={clearFilters}>
              Clear all filters
            </Button>
          )
        }
      />
    )
  } else {
    content = (
      <div className="flex flex-col gap-4">
        <HealthCards
          totals={totals}
          previous={previousTotals}
          periodLabel={periodLabel}
          statusFilter={filters.status}
          comparing={previous !== null && previousStatus.isPending}
          isLoading={status.isPending}
          hrefFor={(value) => eventsHref({ ...filters, status: value ?? filters.status })}
        />
        <EventsChart
          title={<h2 className="text-sm font-semibold text-fg">When</h2>}
          buckets={status.buckets}
          bucket={status.bucket}
          isLoading={status.isPending}
          isError={status.isError}
          isStale={status.isStale}
          onRetry={status.refetch}
          onSelectRange={setTimeRange}
          height={120}
        />
        <div ref={agentsRef}>
          <AgentTable
            items={breakdown.items}
            agentsLoading={agents.isPending}
            agentsFailed={agents.isError}
            allFailed={breakdown.allFailed}
            onRetry={() => {
              if (agents.isError) void agents.refetch()
              breakdown.retryAll()
            }}
            hrefFor={(agent) => eventsHref({ ...filters, agents: [agent] })}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <AppHeader onOpenShortcuts={() => setShortcutsOpen(true)} />
      <Toolbar
        filters={filters}
        onQueryChange={setQuery}
        onAgentsChange={setAgents}
        onStatusChange={setStatus}
        onTimeRangeChange={setTimeRange}
        onClearFilters={clearFilters}
        total={totals?.total ?? null}
        loadedCount={totals?.total ?? 0}
        isLoading={status.isPending || status.isStale}
      />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="sr-only">Overview</h2>
          <p className="text-xs text-muted">
            {updated ? `Updated ${updated}` : 'Loading…'} · Overview doesn’t stream live
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={refresh}
            aria-disabled={status.isFetching || undefined}
          >
            {status.isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
        {slow && <SlowNotice onRetry={refresh} className="mb-3" />}
        {content}
      </main>
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
