import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { computeVirtualRange, OVERSCAN, ROW_HEIGHT, scrollTopToReveal } from '../lib/virtual'

/**
 * Viewport height used when the scroll container reports 0 (jsdom has no layout, and a
 * container can be momentarily collapsed). Big enough for tests to see a screenful of rows.
 */
export const FALLBACK_VIEWPORT_HEIGHT = 600

export interface UseVirtualRowsOptions {
  /** Number of rows that exist (loaded rows, not the server total). */
  count: number
  /** The element that scrolls. It must be mounted for the lifetime of the hook. */
  scrollRef: RefObject<HTMLElement | null>
  rowHeight?: number
  overscan?: number
}

export interface VirtualRows {
  /** First row to render (inclusive). */
  start: number
  /** Last row to render (exclusive). Never greater than `count`. */
  end: number
  /** Height of the spacer that stands in for all `count` rows, in px. */
  totalHeight: number
  /** Measured height of the scroll container (or the fallback), in px. */
  viewportHeight: number
  /** Scroll the minimum amount needed to show row `index` fully ("nearest"); no-op if it already is. */
  scrollToIndex: (index: number) => void
}

/** What the last render was based on. Only replaced when it would change the rendered rows. */
interface Snapshot {
  scrollTop: number
  viewportHeight: number
}

const effectiveHeight = (height: number) => (height > 0 ? height : FALLBACK_VIEWPORT_HEIGHT)

/**
 * Fixed-height list virtualisation (no library).
 *
 * Why it is cheap while scrolling:
 * - scrollTop is read in a *passive* scroll listener, so the browser never waits for us before
 *   scrolling, and reads are coalesced to one per animation frame.
 * - React state only changes when the rendered window [start, end) changes. Scrolling inside
 *   a row's height, or within the same window, causes no render at all.
 * - The window itself is derived during render from the stored snapshot and the *current*
 *   count, so appending a page never renders a stale window (or indexes past the end).
 */
export function useVirtualRows({
  count,
  scrollRef,
  rowHeight = ROW_HEIGHT,
  overscan = OVERSCAN,
}: UseVirtualRowsOptions): VirtualRows {
  const [snapshot, setSnapshot] = useState<Snapshot>({ scrollTop: 0, viewportHeight: 0 })

  // Mirrors of the latest values for the DOM callbacks below, which are created once and must
  // not be re-subscribed on every render.
  const committedRef = useRef(snapshot)
  const paramsRef = useRef({ count, rowHeight, overscan })
  useLayoutEffect(() => {
    paramsRef.current = { count, rowHeight, overscan }
  })

  /** Read the DOM and commit a new snapshot only if it changes which rows are rendered. */
  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const next: Snapshot = { scrollTop: el.scrollTop, viewportHeight: el.clientHeight }
    const prev = committedRef.current
    if (next.viewportHeight === prev.viewportHeight) {
      const params = paramsRef.current
      const a = computeVirtualRange({ ...params, ...prev, viewportHeight: effectiveHeight(prev.viewportHeight) })
      const b = computeVirtualRange({ ...params, ...next, viewportHeight: effectiveHeight(next.viewportHeight) })
      if (a.start === b.start && a.end === b.end) return
    }
    committedRef.current = next
    setSnapshot(next)
  }, [scrollRef])

  // Subscribe once: passive scroll listener (rAF-coalesced) and a ResizeObserver for the
  // container's height (window resize, panel docking, filter bar wrapping…).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let frame = 0
    const schedule = () => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }
    el.addEventListener('scroll', schedule, { passive: true })

    // ResizeObserver callbacks run after layout and before paint, so measuring directly there
    // avoids a frame with the wrong number of rows. jsdom has no ResizeObserver.
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', schedule)
    } else {
      observer = new ResizeObserver(measure)
      observer.observe(el)
    }
    measure()

    return () => {
      el.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [scrollRef, measure])

  // A new page (or a new, shorter result set) changes the maximum scrollTop and therefore the
  // window; re-read the real scrollTop before paint rather than waiting for a scroll event.
  useLayoutEffect(() => {
    measure()
  }, [count, rowHeight, overscan, measure])

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current
      if (!el || index < 0) return
      const target = scrollTopToReveal(index, el.scrollTop, effectiveHeight(el.clientHeight), paramsRef.current.rowHeight)
      if (target === null) return
      el.scrollTop = target
      // Commit the new window now, in the same batch as the caller's state change, instead of
      // a frame later via the scroll event (that would flash an empty viewport on a big jump).
      measure()
    },
    [scrollRef, measure],
  )

  const viewportHeight = effectiveHeight(snapshot.viewportHeight)
  const { start, end, totalHeight } = computeVirtualRange({
    scrollTop: snapshot.scrollTop,
    viewportHeight,
    rowHeight,
    count,
    overscan,
  })

  return { start, end, totalHeight, viewportHeight, scrollToIndex }
}
