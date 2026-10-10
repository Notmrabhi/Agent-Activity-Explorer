import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { IconButton } from './IconButton'
import { CloseIcon } from './icons'

export interface DialogProps {
  open: boolean
  /** Called on Esc, backdrop click or the close button. Set open=false here. */
  onClose: () => void
  /** Visible heading; also the dialog's accessible name. */
  title: string
  children: ReactNode
  /** Extra classes for the dialog box, e.g. a different max width ("max-w-md"). */
  className?: string
}

/**
 * Modal dialog on the native <dialog> element. showModal() gives us the top layer, an inert
 * background, a focus trap and focus restore on close for free. The `open` prop stays the
 * source of truth: native close requests (Esc) are turned into onClose calls.
 */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Esc fires 'cancel'. Cancel it and let React state close the dialog instead.
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    onClose()
  }

  // Browsers may ignore preventDefault on a repeated Esc and close anyway; keep state in sync.
  const handleNativeClose = () => {
    if (open) onClose()
  }

  // The page-level Esc handler (close detail panel) must not fire while the dialog is open.
  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') event.stopPropagation()
  }

  // The dialog box has no padding of its own (the inner div fills it), so a click whose target
  // is the <dialog> itself can only be on the ::backdrop. Both ends of the click must be there:
  // a text selection dragged from inside onto the backdrop must not close the dialog.
  const pressedBackdrop = useRef(false)
  const handlePointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    pressedBackdrop.current = event.target === event.currentTarget
  }
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (pressedBackdrop.current && event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-lg max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg bg-surface p-0 text-fg shadow-popover backdrop:bg-scrim ${className ?? ''}`}
    >
      {/* Only render content while open, so closed dialogs hold no stale focusable content. */}
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border py-3.5 pr-3 pl-5">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <IconButton label="Close (Esc)" variant="ghost" size="sm" onClick={onClose}>
              <CloseIcon size={18} />
            </IconButton>
          </header>
          <div className="min-h-0 overflow-y-auto px-5 pt-2 pb-5">{children}</div>
        </div>
      )}
    </dialog>
  )
}
