import type { EventFilters } from './types'

// Query keys in one place so cache reads/invalidations can't drift from the hooks.
// Filters are normalised (trimmed search, sorted agents) so equivalent views share a cache entry.
export const queryKeys = {
  events: (filters: EventFilters) =>
    ['events', { q: filters.q.trim(), agents: [...filters.agents].sort(), status: filters.status }] as const,
  event: (id: string) => ['event', id] as const,
  agents: () => ['agents'] as const,
}
