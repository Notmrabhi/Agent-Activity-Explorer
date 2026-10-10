// Fixed row height, so the visible window is arithmetic: first row = floor(scrollTop / rowHeight).

/** Must match --row-height in styles/tokens.css. */
export const ROW_HEIGHT = 40
export const OVERSCAN = 8
export const LOAD_MORE_THRESHOLD = 30

export interface VirtualRange {
  start: number
  /** Exclusive. */
  end: number
  totalHeight: number
}

export interface RangeInput {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  count: number
  overscan: number
}

export function computeVirtualRange({
  scrollTop,
  viewportHeight,
  rowHeight,
  count,
  overscan,
}: RangeInput): VirtualRange {
  const totalHeight = Math.max(0, count) * rowHeight
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0, totalHeight: 0 }

  // Elastic overscroll can report a negative scrollTop; a shrinking list one past the end.
  const maxScrollTop = Math.max(0, totalHeight - viewportHeight)
  const top = Math.min(Math.max(0, scrollTop), maxScrollTop)

  const firstVisible = Math.floor(top / rowHeight)
  const visibleCount = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1
  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(count, firstVisible + visibleCount + overscan)
  return { start, end, totalHeight }
}

export function rowOffset(index: number, rowHeight: number): number {
  return index * rowHeight
}

/** Minimal scroll to show the row fully, or null if it already is. */
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

export function shouldLoadMore(
  rangeEnd: number,
  count: number,
  threshold = LOAD_MORE_THRESHOLD,
): boolean {
  return count > 0 && rangeEnd >= count - threshold
}
