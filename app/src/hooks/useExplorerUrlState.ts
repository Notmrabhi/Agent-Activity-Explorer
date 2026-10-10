import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { EMPTY_FILTERS, type EventFilters, type EventStatus } from '../api/types'
import { parseExplorerParams, serializeExplorerParams, type ExplorerUrlState } from '../lib/urlState'

/** Stored on the history entry created when the user opens the panel from the list. */
interface PanelHistoryState {
  panelOpenedInApp: true
}

function isPanelHistoryState(value: unknown): value is PanelHistoryState {
  return typeof value === 'object' && value !== null && 'panelOpenedInApp' in value
}

export interface ExplorerUrlActions {
  /** `replace: true` while the user is mid-typing, so one search = one history entry. */
  setQuery: (q: string, options?: { replace?: boolean }) => void
  setAgents: (agents: string[]) => void
  setStatus: (status: EventStatus | null) => void
  clearFilters: () => void
  /** `replace: true` when moving between events with the keyboard while the panel is open. */
  openEvent: (id: string, options?: { replace?: boolean }) => void
  closeEvent: () => void
}

/**
 * The URL is the single source of truth for search, filters and the open event.
 *
 * History rules:
 * - Filter changes push an entry, so Back undoes them.
 * - Search typing replaces within a burst (see SearchInput), so Back doesn't step letter by letter.
 * - Opening the panel from the list pushes an entry marked `panelOpenedInApp`; closing it then
 *   goes Back, so Back/close behave the same and there is no dead history entry. A panel that
 *   came from a pasted link has no marker, so closing it replaces instead of leaving the app.
 */
export function useExplorerUrlState(): ExplorerUrlState & ExplorerUrlActions {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const state = useMemo(() => parseExplorerParams(searchParams), [searchParams])

  const write = useCallback(
    (next: ExplorerUrlState, options: { replace?: boolean; historyState?: unknown } = {}) => {
      setSearchParams(serializeExplorerParams(next), {
        replace: options.replace ?? false,
        state: options.historyState,
      })
    },
    [setSearchParams],
  )

  const setFilters = useCallback(
    (filters: EventFilters, options: { replace?: boolean } = {}) => {
      // Keep the history marker when replacing, so a later close still knows how the panel opened.
      write({ filters, eventId: state.eventId }, { ...options, historyState: options.replace ? location.state : undefined })
    },
    [write, state.eventId, location.state],
  )

  const setQuery = useCallback(
    (q: string, options?: { replace?: boolean }) => setFilters({ ...state.filters, q }, options),
    [setFilters, state.filters],
  )
  const setAgents = useCallback(
    (agents: string[]) => setFilters({ ...state.filters, agents: [...agents].sort() }),
    [setFilters, state.filters],
  )
  const setStatus = useCallback(
    (status: EventStatus | null) => setFilters({ ...state.filters, status }),
    [setFilters, state.filters],
  )
  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters])

  const openEvent = useCallback(
    (id: string, options: { replace?: boolean } = {}) => {
      if (options.replace) {
        // No "already open" check here: `state` can lag a render behind the URL during a fast
        // J/K burst, so k right after j would look like a no-op and be dropped. Replacing the
        // URL with itself is harmless anyway.
        write({ filters: state.filters, eventId: id }, { replace: true, historyState: location.state })
      } else {
        // Re-opening the open event must not push a duplicate history entry.
        if (id === state.eventId) return
        const marker: PanelHistoryState = { panelOpenedInApp: true }
        write({ filters: state.filters, eventId: id }, { historyState: marker })
      }
    },
    [write, state.filters, state.eventId, location.state],
  )

  const closeEvent = useCallback(() => {
    if (!state.eventId) return
    if (isPanelHistoryState(location.state)) {
      navigate(-1)
    } else {
      write({ filters: state.filters, eventId: null }, { replace: true })
    }
  }, [navigate, write, state.filters, state.eventId, location.state])

  return { ...state, setQuery, setAgents, setStatus, clearFilters, openEvent, closeEvent }
}
