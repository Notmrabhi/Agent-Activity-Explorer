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
  onClose: () => void
  /** Clicks on the anchor are not "outside", so its own toggle works. */
  anchorRef: RefObject<HTMLElement | null>
  label: string
  id?: string
  align?: 'start' | 'end'
  className?: string
  children: ReactNode
}

const FOCUSABLE =
  'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/** Non-modal popover. The anchor needs aria-haspopup="dialog", aria-expanded and aria-controls. */
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

  const onOutsidePointer = useEffectEvent((event: PointerEvent) => {
    if (event.target instanceof Node && !isInside(event.target)) onClose()
  })

  useEffect(() => {
    if (!open) return
    const popover = popoverRef.current
    const first = popover?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? popover)?.focus()

    // Capture phase: a child that stops propagation still closes us.
    document.addEventListener('pointerdown', onOutsidePointer, true)
    return () => document.removeEventListener('pointerdown', onOutsidePointer, true)
  }, [open])

  if (!open) return null

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    event.preventDefault()
    onClose()
    anchorRef.current?.focus()
  }

  // relatedTarget is null when an option re-rendered, which must not close it.
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
