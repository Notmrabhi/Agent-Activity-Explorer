import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { computeVirtualRange, OVERSCAN, ROW_HEIGHT, scrollTopToReveal } from '../lib/virtual'

/** Used when the container reports 0 height (jsdom, or a momentary collapse). */
export const FALLBACK_VIEWPORT_HEIGHT = 600

export interface UseVirtualRowsOptions {
  /** Loaded rows, not the server total. */
  count: number
  /** The element that scrolls. It must be mounted for the lifetime of the hook. */
  scrollRef: RefObject<HTMLElement | null>
  rowHeight?: number
  overscan?: number
}

export interface VirtualRows {
  start: number
  end: number
  totalHeight: number
  viewportHeight: number
  scrollToIndex: (index: number) => void
  scrollBy: (delta: number) => void
}

interface Snapshot {
  scrollTop: number
  viewportHeight: number
}

const effectiveHeight = (height: number) => (height > 0 ? height : FALLBACK_VIEWPORT_HEIGHT)

/**
 * Fixed-height virtualisation. Passive, rAF-coalesced scroll reads; state only changes when the
 * rendered window changes, so most scroll events cause no render.
 */
export function useVirtualRows({
  count,
  scrollRef,
  rowHeight = ROW_HEIGHT,
  overscan = OVERSCAN,
}: UseVirtualRowsOptions): VirtualRows {
  const [snapshot, setSnapshot] = useState<Snapshot>({ scrollTop: 0, viewportHeight: 0 })

  const committedRef = useRef(snapshot)
  const paramsRef = useRef({ count, rowHeight, overscan })
  useLayoutEffect(() => {
    paramsRef.current = { count, rowHeight, overscan }
  })

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const next: Snapshot = { scrollTop: el.scrollTop, viewportHeight: el.clientHeight }
    const prev = committedRef.current
    if (next.viewportHeight === prev.viewportHeight) {
      const params = paramsRef.current
      const a = computeVirtualRange({
        ...params,
        ...prev,
        viewportHeight: effectiveHeight(prev.viewportHeight),
      })
      const b = computeVirtualRange({
        ...params,
        ...next,
        viewportHeight: effectiveHeight(next.viewportHeight),
      })
      if (a.start === b.start && a.end === b.end) return
    }
    committedRef.current = next
    setSnapshot(next)
  }, [scrollRef])

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

    // Measured in the callback (after layout, before paint): no frame with the wrong row count.
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

  // A new or shorter list changes the max scrollTop: re-read it before paint.
  useLayoutEffect(() => {
    measure()
  }, [count, rowHeight, overscan, measure])

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current
      if (!el || index < 0) return
      const target = scrollTopToReveal(
        index,
        el.scrollTop,
        effectiveHeight(el.clientHeight),
        paramsRef.current.rowHeight,
      )
      if (target === null) return
      el.scrollTop = target
      // Commit now, not on the next scroll event: a big jump would flash an empty viewport.
      measure()
    },
    [scrollRef, measure],
  )

  const scrollBy = useCallback(
    (delta: number) => {
      const el = scrollRef.current
      if (!el || delta === 0) return
      el.scrollTop += delta
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

  return { start, end, totalHeight, viewportHeight, scrollToIndex, scrollBy }
}
