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
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

/** Native <dialog>: focus trap and inert background for free. `open` stays the source of truth. */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    onClose()
  }

  // A repeated Esc can close it despite preventDefault; keep state in sync.
  const handleNativeClose = () => {
    if (open) onClose()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') event.stopPropagation()
  }

  // A click on the <dialog> itself is on the backdrop; both ends must be there, so a drag out
  // of a text selection doesn't close it.
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
