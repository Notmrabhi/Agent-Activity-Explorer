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
  width: number
  minWidth: number
  maxWidth: number
  onResize: (px: number) => void
  onReset: () => void
  /** Carries PANEL_WIDTH_VAR; rewritten directly while dragging. */
  targetRef: RefObject<HTMLElement | null>
  controls?: string
}

const STEP = 16
const BIG_STEP = 64

interface Drag {
  pointerId: number
  startX: number
  startWidth: number
  width: number
  frame: number
}

/** Page-wide, so they hold when the pointer leaves the 8px handle. */
function setDocumentDragStyles(on: boolean) {
  const style = document.body.style
  style.cursor = on ? 'col-resize' : ''
  style.userSelect = on ? 'none' : ''
}

/**
 * WAI-ARIA window splitter. ArrowLeft widens the panel (it is on the right). A drag writes a CSS
 * variable once per frame with no React render; the width is committed on pointerup.
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

  // Unmounting mid-drag must not leave the page stuck with a resize cursor.
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
    if (event.button !== 0) return
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
    drag.width = clampPanelWidth(drag.startWidth + drag.startX - event.clientX, maxWidth)
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
        // Cancel the drag only, not the panel.
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
      onLostPointerCapture={() => endDrag(true)}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className="group relative z-10 -mx-1 w-2 flex-none cursor-col-resize touch-none focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors duration-(--duration-fast) group-hover:w-0.5 group-hover:bg-accent group-focus-visible:w-0.5 group-focus-visible:bg-accent group-data-dragging:w-0.5 group-data-dragging:bg-accent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-8 w-1 -translate-1/2 rounded-full bg-control transition-colors duration-(--duration-fast) group-hover:bg-accent group-focus-visible:bg-accent group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent group-data-dragging:bg-accent"
      />
    </div>
  )
}
