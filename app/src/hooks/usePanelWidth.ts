import { useCallback, useState, useSyncExternalStore, type CSSProperties } from 'react'

/** Matches the `--panel-width` token. */
export const PANEL_DEFAULT_WIDTH = 460
export const PANEL_MIN_WIDTH = 360
const PANEL_MAX_WIDTH = 960
const LIST_MIN_WIDTH = 480

const STORAGE_KEY = 'agent-activity:panel-width'

/** Rewritten by ResizeHandle during a drag without a React render. */
export const PANEL_WIDTH_VAR = '--detail-panel-width'

/** Largest panel width that leaves the list LIST_MIN_WIDTH, within [min, 960]. */
export function maxPanelWidth(viewportWidth: number): number {
  return Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, viewportWidth - LIST_MIN_WIDTH))
}

export function clampPanelWidth(width: number, max: number): number {
  return Math.round(Math.min(max, Math.max(PANEL_MIN_WIDTH, width)))
}

export function panelWidthStyle(width: number): CSSProperties {
  return { [PANEL_WIDTH_VAR]: `${width}px` } as CSSProperties
}

// Storage can throw (private mode) or hold junk: fall back to the default.
function readStoredWidth(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    if (Number.isFinite(value) && value >= PANEL_MIN_WIDTH && value <= PANEL_MAX_WIDTH) {
      return Math.round(value)
    }
  } catch {}
  return PANEL_DEFAULT_WIDTH
}

function writeStoredWidth(width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, String(width))
  } catch {}
}

function subscribeToResize(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

// The max, not innerWidth, so a window resize doesn't re-render on every pixel.
const getMaxSnapshot = () => maxPanelWidth(window.innerWidth)
const getServerMaxSnapshot = () => PANEL_DEFAULT_WIDTH

export interface PanelWidth {
  /** The width to render, in px: the preferred width clamped to the viewport, or the max when expanded. */
  width: number
  minWidth: number
  maxWidth: number
  setWidth: (px: number) => void
  reset: () => void
  expanded: boolean
  toggleExpanded: () => void
}

/** In localStorage, not the URL: a shared link shouldn't resize a colleague's panel. */
export function usePanelWidth(): PanelWidth {
  const [preferred, setPreferred] = useState(readStoredWidth)
  const [expanded, setExpanded] = useState(false)
  const maxWidth = useSyncExternalStore(subscribeToResize, getMaxSnapshot, getServerMaxSnapshot)

  const width = expanded ? maxWidth : clampPanelWidth(preferred, maxWidth)

  const setWidth = useCallback(
    (px: number) => {
      const next = clampPanelWidth(px, maxWidth)
      setPreferred(next)
      setExpanded(false)
      writeStoredWidth(next)
    },
    [maxWidth],
  )

  const reset = useCallback(() => {
    setPreferred(PANEL_DEFAULT_WIDTH)
    setExpanded(false)
    writeStoredWidth(null)
  }, [])

  const toggleExpanded = useCallback(() => setExpanded((value) => !value), [])

  return {
    width,
    minWidth: PANEL_MIN_WIDTH,
    maxWidth,
    setWidth,
    reset,
    expanded,
    toggleExpanded,
  }
}
