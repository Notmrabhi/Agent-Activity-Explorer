// Hand-written list virtualisation maths (no library, per the brief).
//
// Every row has the same fixed height, so the visible window is pure arithmetic:
//   first visible row = floor(scrollTop / rowHeight)
// We render that window plus `overscan` rows either side, positioned inside a spacer that is as
// tall as all loaded rows, so the scrollbar behaves as if every row were in the DOM.

/** Must match --row-height in styles/tokens.css. */
export const ROW_HEIGHT = 40
/** Extra rows rendered above and below the viewport to avoid blank flashes while scrolling. */
export const OVERSCAN = 8
/** Start fetching the next page when the rendered window is this many rows from the end. */
export const LOAD_MORE_THRESHOLD = 30

export interface VirtualRange {
  /** First rendered index (inclusive). */
  start: number
  /** Last rendered index (exclusive). */
  end: number
  /** Total height of the spacer, in px. */
  totalHeight: number
}

export interface RangeInput {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  count: number
  overscan: number
}

export function computeVirtualRange({ scrollTop, viewportHeight, rowHeight, count, overscan }: RangeInput): VirtualRange {
  const totalHeight = Math.max(0, count) * rowHeight
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0, totalHeight: 0 }

  // Clamp: elastic overscroll can report negative scrollTop, and a shrinking list can leave
  // scrollTop past the end for a frame.
  const maxScrollTop = Math.max(0, totalHeight - viewportHeight)
  const top = Math.min(Math.max(0, scrollTop), maxScrollTop)

  const firstVisible = Math.floor(top / rowHeight)
  const visibleCount = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1
  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(count, firstVisible + visibleCount + overscan)
  return { start, end, totalHeight }
}

/** Pixel offset of a row inside the spacer. */
export function rowOffset(index: number, rowHeight: number): number {
  return index * rowHeight
}

/**
 * The scrollTop needed to bring row `index` fully into view with minimal movement
 * ("nearest" alignment), or null if it is already fully visible.
 */
export function scrollTopToReveal(
  index: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
): number | null {
  const rowTop = index * rowHeight
  const rowBottom = rowTop + rowHeight
  if (rowTop < scrollTop) return rowTop
  if (rowBottom > scrollTop + viewportHeight) return rowBottom - viewportHeight
  return null
}

export function shouldLoadMore(rangeEnd: number, count: number, threshold = LOAD_MORE_THRESHOLD): boolean {
  return count > 0 && rangeEnd >= count - threshold
}
