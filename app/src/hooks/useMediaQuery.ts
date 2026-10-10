import { useCallback, useSyncExternalStore } from 'react'

/** Subscribes to a CSS media query, e.g. useMediaQuery('(min-width: 1200px)'). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** At or above this width the detail panel docks beside the list; below it overlays. */
export const DOCKED_PANEL_QUERY = '(min-width: 1200px)'
