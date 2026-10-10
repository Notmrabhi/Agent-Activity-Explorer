import type { ReactNode } from 'react'
import { Button } from '../ui/Button'
import { KeyboardIcon, LogoMark } from '../ui/icons'
import { Kbd } from '../ui/Kbd'

export interface AppHeaderProps {
  /** Opens the keyboard-shortcuts dialog (the same thing the "?" key does). */
  onOpenShortcuts: () => void
  /** Extra controls shown before the shortcuts button (the Live toggle). */
  actions?: ReactNode
}

/** App banner: brand, one-line purpose, and the shortcuts entry point. */
export function AppHeader({ onOpenShortcuts, actions }: AppHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <LogoMark />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Agent Activity</h1>
          <p className="hidden truncate text-xs text-muted sm:block">
            Every tool call your agents made, newest first
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
      {actions}
      {/* The keycap is a visual hint only; aria-keyshortcuts tells assistive tech about "?". */}
      <Button
        size="sm"
        icon={<KeyboardIcon />}
        iconEnd={
          <span aria-hidden="true">
            <Kbd size="sm">?</Kbd>
          </span>
        }
        aria-keyshortcuts="?"
        onClick={onOpenShortcuts}
      >
        Shortcuts
      </Button>
      </div>
    </header>
  )
}
