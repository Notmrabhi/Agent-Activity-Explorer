import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { clampPanelWidth, PANEL_WIDTH_VAR } from '../../hooks/usePanelWidth'

export interface ResizeHandleProps {
  /** Current panel width in px (committed state). */
  width: number
  minWidth: number
  maxWidth: number
  /** Commit a new width: drag end and keyboard steps. */
  onResize: (px: number) => void
  /** Back to the default width: double-click or Enter. */
  onReset: () => void
  /** The element that carries PANEL_WIDTH_VAR; rewritten directly while dragging. */
  targetRef: RefObject<HTMLElement | null>
  /** id of the panel this handle resizes. */
  controls?: string
}

/** Arrow-key step, and the Shift+Arrow step. */
const STEP = 16
const BIG_STEP = 64

interface Drag {
  pointerId: number
  startX: number
  startWidth: number
  /** Latest width written (or about to be written) to the CSS variable. */
  width: number
  frame: number
}

/** Page-wide during a drag, so they hold even when the pointer leaves the 8px handle. */
function setDocumentDragStyles(on: boolean) {
  const style = document.body.style
  style.cursor = on ? 'col-resize' : ''
  style.userSelect = on ? 'none' : ''
}

/**
 * Vertical splitter between the list and the docked detail panel (WAI-ARIA window splitter).
 *
 * The panel is on the right, so the keys follow the handle's direction of travel:
 * ArrowLeft (or Home, all the way) moves the handle left and makes the panel WIDER; ArrowRight
 * (or End) makes it narrower. Shift takes bigger steps. Enter or a double-click resets it.
 * aria-valuenow is the panel width in px.
 *
 * Dragging writes the width straight to a CSS custom property inside requestAnimationFrame, so
 * a pointermove costs one style write and no React render of the page (the list, with its
 * virtualised rows, never re-renders mid-drag). The width is committed to state on pointerup.
 * Esc during a drag puts the panel back where it was.
 */
export function ResizeHandle({
  width,
  minWidth,
  maxWidth,
  onResize,
  onReset,
  targetRef,
  controls,
}: ResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)

  const writeWidth = (px: number) => {
    targetRef.current?.style.setProperty(PANEL_WIDTH_VAR, `${px}px`)
    // React's value only updates on commit; keep what assistive tech reads in step meanwhile.
    handleRef.current?.setAttribute('aria-valuenow', String(px))
  }

  const endDrag = (commit: boolean) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    cancelAnimationFrame(drag.frame)
    if (handleRef.current?.hasPointerCapture(drag.pointerId)) {
      handleRef.current.releasePointerCapture(drag.pointerId)
    }
    setDocumentDragStyles(false)
    setDragging(false)
    if (commit) {
      writeWidth(drag.width)
      if (drag.width !== drag.startWidth) onResize(drag.width)
    } else {
      writeWidth(drag.startWidth)
    }
  }

  // Unmounting mid-drag (panel closed by J/K past the end, viewport crosses the dock breakpoint)
  // must not leave the whole page stuck with a col-resize cursor and no text selection.
  useEffect(
    () => () => {
      if (dragRef.current) {
        cancelAnimationFrame(dragRef.current.frame)
        setDocumentDragStyles(false)
      }
    },
    [],
  )

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Primary button / touch / pen only; a right-click opens the context menu as usual.
    if (event.button !== 0) return
    // Stops the browser starting a text selection from the press.
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
      width,
      frame: 0,
    }
    setDocumentDragStyles(true)
    setDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    // The panel grows as the pointer moves left.
    drag.width = clampPanelWidth(drag.startWidth + drag.startX - event.clientX, maxWidth)
    // Coalesce: many pointermoves per frame on high-rate mice, one style write per frame.
    if (drag.frame === 0) {
      drag.frame = requestAnimationFrame(() => {
        drag.frame = 0
        writeWidth(drag.width)
      })
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      if (event.key === 'Escape') {
        // Cancel the drag only; do not let the panel's Esc handler close the panel as well.
        event.preventDefault()
        event.stopPropagation()
        endDrag(false)
      }
      return
    }
    const step = event.shiftKey ? BIG_STEP : STEP
    let next: number
    switch (event.key) {
      case 'ArrowLeft':
        next = width + step
        break
      case 'ArrowRight':
        next = width - step
        break
      case 'Home':
        next = maxWidth
        break
      case 'End':
        next = minWidth
        break
      case 'Enter':
        event.preventDefault()
        onReset()
        return
      default:
        return
    }
    event.preventDefault()
    const clamped = clampPanelWidth(next, maxWidth)
    if (clamped !== width) onResize(clamped)
  }

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize details panel"
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuetext={`${width} pixels wide`}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      data-dragging={dragging ? '' : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => endDrag(true)}
      onPointerCancel={() => endDrag(true)}
      // Capture can also end without pointerup (e.g. the window lost focus).
      onLostPointerCapture={() => endDrag(true)}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      // Takes no layout room: 8px wide, pulled 4px into the list's padding and 4px over the
      // panel's border, so its centre line sits exactly on that border. touch-none stops a
      // touch drag from scrolling the page instead.
      className="group relative z-10 -mx-1 w-2 flex-none cursor-col-resize touch-none focus-visible:outline-none"
    >
      {/* The visible line: the panel border's colour at rest, accent and thicker when active. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors duration-(--duration-fast) group-hover:w-0.5 group-hover:bg-accent group-focus-visible:w-0.5 group-focus-visible:bg-accent group-data-dragging:w-0.5 group-data-dragging:bg-accent"
      />
      {/* Grip: makes the handle discoverable without hovering. Ringed on keyboard focus. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-8 w-1 -translate-1/2 rounded-full bg-control transition-colors duration-(--duration-fast) group-hover:bg-accent group-focus-visible:bg-accent group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent group-data-dragging:bg-accent"
      />
    </div>
  )
}
