import {
  useEffect,
  useEffectEvent,
  useRef,
  type KeyboardEvent,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from 'react'

export interface PopoverProps {
  open: boolean
  /** Called on outside pointerdown, Escape, or focus leaving the popover. Set open=false here. */
  onClose: () => void
  /** The button that toggles the popover. Clicks on it are not "outside", so its own toggle works. */
  anchorRef: RefObject<HTMLElement | null>
  /** Accessible name of the dialog, e.g. "Filter by agent". */
  label: string
  /** Put the same id in the anchor's aria-controls. */
  id?: string
  /** Which edge of the anchor the popover lines up with. Default 'start'. */
  align?: 'start' | 'end'
  /** Width and padding, e.g. "w-72 p-2". */
  className?: string
  children: ReactNode
}

const FOCUSABLE =
  'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * Lightweight non-modal popover for filter menus. Render it next to its anchor inside a
 * `relative` wrapper; it is absolutely positioned under the anchor.
 *
 * The anchor should have `aria-haspopup="dialog"`, `aria-expanded={open}` and
 * `aria-controls={id}`. Focus moves into the popover on open and back to the anchor on Escape.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  label,
  id,
  align = 'start',
  className,
  children,
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  const isInside = (node: Node) =>
    (popoverRef.current?.contains(node) ?? false) || (anchorRef.current?.contains(node) ?? false)

  // Effect events read the latest onClose without re-subscribing listeners on every render.
  const onOutsidePointer = useEffectEvent((event: PointerEvent) => {
    if (event.target instanceof Node && !isInside(event.target)) onClose()
  })

  useEffect(() => {
    if (!open) return
    // Move focus in so keyboard users land on the search box or first option.
    const popover = popoverRef.current
    const first = popover?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? popover)?.focus()

    // Capture phase: a child that stops propagation (e.g. a table row) still closes us.
    document.addEventListener('pointerdown', onOutsidePointer, true)
    return () => document.removeEventListener('pointerdown', onOutsidePointer, true)
  }, [open])

  if (!open) return null

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    // Stop here so the page-level Esc handler does not also close the detail panel.
    event.stopPropagation()
    event.preventDefault()
    onClose()
    anchorRef.current?.focus()
  }

  // Tabbing out of the popover closes it, like a native menu. relatedTarget is null when focus
  // just vanished (an option re-rendered), which must not close it.
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget
    if (next instanceof Node && !isInside(next)) onClose()
  }

  return (
    <div
      ref={popoverRef}
      id={id}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className={`absolute top-full z-30 mt-1 rounded-lg border border-border bg-surface text-fg shadow-popover outline-none ${align === 'end' ? 'right-0' : 'left-0'} ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
