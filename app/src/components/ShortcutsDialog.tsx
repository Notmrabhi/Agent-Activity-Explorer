import { Fragment } from 'react'
import { Dialog } from './ui/Dialog'
import { Kbd } from './ui/Kbd'

export interface ShortcutsDialogProps {
  open: boolean
  onClose: () => void
}

interface Shortcut {
  label: string
  keys: readonly string[]
}

interface ShortcutGroup {
  title: string
  items: readonly Shortcut[]
}

// Keep in sync with the page's key handler (pages/ExplorerPage.tsx) and docs/DESIGN.md.
const GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Anywhere',
    items: [
      { label: 'Focus search', keys: ['/'] },
      { label: 'Show shortcuts', keys: ['?'] },
      { label: 'Close panel or dialog', keys: ['Esc'] },
    ],
  },
  {
    title: 'Event list',
    items: [
      { label: 'Next / previous event', keys: ['J', 'K'] },
      { label: 'Next / previous (arrows)', keys: ['↓', '↑'] },
      { label: 'First / last loaded event', keys: ['Home', 'End'] },
      { label: 'Open details', keys: ['Enter'] },
    ],
  },
]

/** "?" dialog listing every keyboard shortcut, grouped by where it works. */
export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="mt-3 mb-1.5 text-xs font-medium tracking-wider text-muted uppercase">
            {group.title}
          </h3>
          <dl>
            {group.items.map((item) => (
              <div
                key={item.label}
                className="flex h-8 items-center justify-between gap-4 border-b border-border"
              >
                <dt className="text-sm">{item.label}</dt>
                <dd className="flex items-center gap-1">
                  {item.keys.map((key, index) => (
                    <Fragment key={key}>
                      {/* Paired keys mirror the "next / previous" wording for screen readers. */}
                      {index > 0 && <span className="sr-only"> / </span>}
                      <Kbd>{key}</Kbd>
                    </Fragment>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </Dialog>
  )
}
