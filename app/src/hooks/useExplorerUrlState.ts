import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { EMPTY_FILTERS, type EventFilters, type EventStatus, type TimeRange } from '../api/types'
import {
  parseExplorerParams,
  serializeExplorerParams,
  type ExplorerUrlState,
} from '../lib/urlState'

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
  setTimeRange: (range: TimeRange) => void
  clearFilters: () => void
  /** `replace: true` when moving between events with the keyboard while the panel is open. */
  openEvent: (id: string, options?: { replace?: boolean }) => void
  closeEvent: () => void
}

/**
 * History: filter changes push. Opening the panel from the list pushes a marked entry, so closing
 * goes Back; a pasted link has no marker, so closing replaces instead of leaving the app.
 * Switching events while open replaces, so one Esc always returns to the list.
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
      write(
        { filters, eventId: state.eventId },
        { ...options, historyState: options.replace ? location.state : undefined },
      )
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
  const setTimeRange = useCallback(
    (range: TimeRange) => {
      // Same range twice must not push a duplicate history entry.
      if (range.from === state.filters.from && range.to === state.filters.to) return
      setFilters({ ...state.filters, from: range.from, to: range.to })
    },
    [setFilters, state.filters],
  )
  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters])

  const openEvent = useCallback(
    (id: string, options: { replace?: boolean } = {}) => {
      if (options.replace || (state.eventId !== null && id !== state.eventId)) {
        // No "already open" check: `state` lags during a fast J/K burst.
        write(
          { filters: state.filters, eventId: id },
          { replace: true, historyState: location.state },
        )
      } else {
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

  return {
    ...state,
    setQuery,
    setAgents,
    setStatus,
    setTimeRange,
    clearFilters,
    openEvent,
    closeEvent,
  }
}
