import { useRef, type Ref } from 'react'
import type { EventFilters, EventStatus } from '../../api/types'
import { hasActiveFilters } from '../../lib/urlState'
import { Button } from '../ui/Button'
import { AgentFilter } from './AgentFilter'
import { ResultCount } from './ResultCount'
import { SearchInput } from './SearchInput'
import { StatusFilter } from './StatusFilter'

export interface ToolbarProps {
  /** Current filters, from the URL. */
  filters: EventFilters
  onQueryChange: (q: string, options: { replace: boolean }) => void
  onAgentsChange: (agents: string[]) => void
  onStatusChange: (status: EventStatus | null) => void
  onClearFilters: () => void
  /** Total matching events, or null before the first page has loaded. */
  total: number | null
  /** Rows loaded so far. */
  loadedCount: number
  /** True while the list is loading for the current filters. */
  isLoading: boolean
  /** Forwarded to the search <input> (the page focuses it on "/"). */
  searchInputRef?: Ref<HTMLInputElement>
}

/**
 * Search and filter bar: one control per dimension (Jira-style filter buttons), a "Clear
 * filters" shortcut when anything is filtered, and the result count on the right.
 * Below md the search box takes its own full-width row and the filters wrap under it.
 */
export function Toolbar({
  filters,
  onQueryChange,
  onAgentsChange,
  onStatusChange,
  onClearFilters,
  total,
  loadedCount,
  isLoading,
  searchInputRef,
}: ToolbarProps) {
  const regionRef = useRef<HTMLDivElement>(null)

  const handleClear = () => {
    onClearFilters()
    // This button disappears once nothing is filtered; park focus in the search box instead of
    // dropping it to <body>. (searchInputRef may be a callback ref, so look the input up.)
    regionRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
  }

  return (
    // role="search" on a div rather than <search>: same landmark, wider browser and
    // test-tooling support.
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
      {hasActiveFilters(filters) && (
        <Button variant="link" className="px-1 py-1.5 text-sm" onClick={handleClear}>
          Clear filters
        </Button>
      )}
      <ResultCount
        total={total}
        loadedCount={loadedCount}
        isLoading={isLoading}
        className="ml-auto"
      />
    </div>
  )
}
