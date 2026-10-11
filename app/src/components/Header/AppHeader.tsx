import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { Button } from '../ui/Button'
import { KeyboardIcon, LogoMark } from '../ui/icons'
import { Kbd } from '../ui/Kbd'

export interface AppHeaderProps {
  /** Opens the keyboard-shortcuts dialog (the same thing the "?" key does). */
  onOpenShortcuts: () => void
  /** Extra controls shown before the shortcuts button (the Live toggle). */
  actions?: ReactNode
}

const VIEWS = [
  { to: '/overview', label: 'Overview', end: false },
  { to: '/', label: 'Events', end: true },
] as const

/** App banner: brand, the Overview | Events navigation, and the shortcuts entry point. */
export function AppHeader({ onOpenShortcuts, actions }: AppHeaderProps) {
  const location = useLocation()
  // Switching views keeps the filters; the open event belongs to the Events view only.
  const params = new URLSearchParams(location.search)
  params.delete('event')
  const search = params.toString() ? `?${params.toString()}` : ''

  return (
    <header className="flex h-16 shrink-0 items-stretch justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-7">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark />
          <h1 className="sr-only text-lg font-semibold sm:not-sr-only">Agent Activity</h1>
        </div>
        <nav aria-label="Views" className="flex h-full">
          {VIEWS.map((view) => (
            <NavLink
              key={view.to}
              to={{ pathname: view.to, search }}
              end={view.end}
              className={({ isActive }) =>
                `flex h-full items-center border-b-2 px-3 text-sm font-medium focus-visible:-outline-offset-2 ${
                  isActive ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
                }`
              }
            >
              {view.label}
            </NavLink>
          ))}
        </nav>
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
