import type { EventFilters } from './types'

// Filters are normalised (trimmed search, sorted agents) so equivalent views share a cache entry.
function normalized(filters: EventFilters) {
  return {
    q: filters.q.trim(),
    agents: [...filters.agents].sort(),
    status: filters.status,
    from: filters.from,
    to: filters.to,
  }
}

// Query keys in one place so cache reads/invalidations can't drift from the hooks.
export const queryKeys = {
  events: (filters: EventFilters) => ['events', normalized(filters)] as const,
  // Live mode's look at the newest page. Not under 'events', so it never touches the list cache.
  eventsHead: (filters: EventFilters) => ['events-head', normalized(filters)] as const,
  // Not under 'events': invalidating the lists must not also refetch the time-range anchor.
  newestEvent: () => ['newest-event'] as const,
  event: (id: string) => ['event', id] as const,
  agents: () => ['agents'] as const,
}
