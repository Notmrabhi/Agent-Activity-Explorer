import { useCallback, useState, useSyncExternalStore, type CSSProperties } from 'react'

/** Matches the `--panel-width` token: the width a first-time viewer gets. */
export const PANEL_DEFAULT_WIDTH = 460
export const PANEL_MIN_WIDTH = 360
/** Hard ceiling: beyond this a JSON payload line is too long to read comfortably anyway. */
const PANEL_MAX_WIDTH = 960
/** The list must keep at least this much room beside the docked panel. */
const LIST_MIN_WIDTH = 480

const STORAGE_KEY = 'agent-activity:panel-width'

/**
 * CSS custom property carrying the docked panel's width. Set on the layout element that holds
 * the list and the panel, so ResizeHandle can rewrite it during a drag without a React render;
 * the panel reads it (`w-(--detail-panel-width)`).
 */
export const PANEL_WIDTH_VAR = '--detail-panel-width'

/** Largest panel width that leaves the list LIST_MIN_WIDTH, within [min, 960]. */
export function maxPanelWidth(viewportWidth: number): number {
  return Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, viewportWidth - LIST_MIN_WIDTH))
}

export function clampPanelWidth(width: number, max: number): number {
  return Math.round(Math.min(max, Math.max(PANEL_MIN_WIDTH, width)))
}

/** The style that publishes `width` as PANEL_WIDTH_VAR on the layout element. */
export function panelWidthStyle(width: number): CSSProperties {
  // CSSProperties has no index signature for custom properties; this is the standard escape.
  return { [PANEL_WIDTH_VAR]: `${width}px` } as CSSProperties
}

// Storage can throw (private mode, blocked site data) or hold junk from an older build:
// either way fall back to the default rather than break the page.
function readStoredWidth(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    if (Number.isFinite(value) && value >= PANEL_MIN_WIDTH && value <= PANEL_MAX_WIDTH) {
      return Math.round(value)
    }
  } catch {
    // Ignore: a per-viewer convenience, not state that must survive.
  }
  return PANEL_DEFAULT_WIDTH
}

function writeStoredWidth(width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, String(width))
  } catch {
    // Ignore, see readStoredWidth.
  }
}

function subscribeToResize(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

// The snapshot is the derived max, not innerWidth: React only re-renders when the max actually
// changes (never above 1440px or below 840px), not on every pixel of a window resize.
const getMaxSnapshot = () => maxPanelWidth(window.innerWidth)
const getServerMaxSnapshot = () => PANEL_DEFAULT_WIDTH

export interface PanelWidth {
  /** The width to render, in px: the preferred width clamped to the viewport, or the max when expanded. */
  width: number
  minWidth: number
  /** Leaves the list at least 480px; follows window resizes. */
  maxWidth: number
  /** Commit a width (drag end, arrow keys). Clamped, persisted, and ends "expanded". */
  setWidth: (px: number) => void
  /** Back to the default width (double-click or Enter on the handle). */
  reset: () => void
  /** The panel is temporarily as wide as it can be. */
  expanded: boolean
  /** Switch between the preferred width and the max; the preferred width is kept for restore. */
  toggleExpanded: () => void
}

/**
 * Width of the docked detail panel. The viewer's preferred width is remembered in localStorage:
 * a per-viewer convenience like a column width, so it is deliberately not in the URL (a shared
 * link should not resize a colleague's panel).
 *
 * The preferred width is stored unclamped and clamped on read, so shrinking the window narrows
 * the panel and widening it again brings the preferred width back.
 */
export function usePanelWidth(): PanelWidth {
  const [preferred, setPreferred] = useState(readStoredWidth)
  const [expanded, setExpanded] = useState(false)
  const maxWidth = useSyncExternalStore(subscribeToResize, getMaxSnapshot, getServerMaxSnapshot)

  const width = expanded ? maxWidth : clampPanelWidth(preferred, maxWidth)

  const setWidth = useCallback(
    (px: number) => {
      // Clamp to the current viewport: a width the viewer can see is the one they meant.
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
