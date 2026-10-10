import { useRef, type Ref } from 'react'
import type { EventFilters, EventStatus, TimeRange } from '../../api/types'
import { hasActiveFilters } from '../../lib/urlState'
import { Button } from '../ui/Button'
import { AgentFilter } from './AgentFilter'
import { ResultCount } from './ResultCount'
import { SearchInput } from './SearchInput'
import { StatusFilter } from './StatusFilter'
import { TimeRangeFilter } from './TimeRangeFilter'

export interface ToolbarProps {
  filters: EventFilters
  onQueryChange: (q: string, options: { replace: boolean }) => void
  onAgentsChange: (agents: string[]) => void
  onStatusChange: (status: EventStatus | null) => void
  onTimeRangeChange: (range: TimeRange) => void
  onClearFilters: () => void
  total: number | null
  loadedCount: number
  isLoading: boolean
  searchInputRef?: Ref<HTMLInputElement>
}

export function Toolbar({
  filters,
  onQueryChange,
  onAgentsChange,
  onStatusChange,
  onTimeRangeChange,
  onClearFilters,
  total,
  loadedCount,
  isLoading,
  searchInputRef,
}: ToolbarProps) {
  const regionRef = useRef<HTMLDivElement>(null)

  const handleClear = () => {
    onClearFilters()
    // The button disappears: keep focus off <body>.
    regionRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
  }

  return (
    <div
      ref={regionRef}
      role="search"
      aria-label="Search and filter events"
      className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6"
    >
      <SearchInput
        ref={searchInputRef}
        value={filters.q}
        onCommit={onQueryChange}
        className="basis-full md:max-w-[460px] md:grow md:basis-80"
      />
      <AgentFilter selected={filters.agents} onChange={onAgentsChange} />
      <StatusFilter value={filters.status} onChange={onStatusChange} />
      <TimeRangeFilter from={filters.from} to={filters.to} onChange={onTimeRangeChange} />
      {hasActiveFilters(filters) && (
        <Button variant="link" className="px-1 py-1.5 text-sm" onClick={handleClear}>
          Clear filters
        </Button>
      )}
      <ResultCount
        total={total}
        loadedCount={loadedCount}
        isLoading={isLoading}
        resultKey={JSON.stringify(filters)}
        className="ml-auto"
      />
    </div>
  )
}
