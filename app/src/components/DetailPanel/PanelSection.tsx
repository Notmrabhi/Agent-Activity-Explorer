import type { ReactNode } from 'react'
import { ChevronDownIcon } from '../ui/icons'

export interface PanelSectionProps {
  /** Section heading, e.g. "Policy matches". */
  title: string
  /** Quiet text after the title, e.g. "· 2 rules fired". Part of the toggle's accessible name. */
  meta?: ReactNode
  /** Buttons on the right of the title row, e.g. "Copy JSON". Shown while the section is open. */
  actions?: ReactNode
  /** Default true. Only read on mount: afterwards the user owns the open state. */
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

/**
 * Collapsible panel section (Jira's issue-view pattern) on native <details>/<summary>: keyboard
 * toggling, the expanded state and find-in-page auto-expansion come from the browser.
 *
 * `actions` are rendered next to the summary, not inside it: a button nested in <summary> would
 * be an interactive control inside another one (and clicking it would toggle the section).
 * They are positioned over the right end of the title row instead.
 */
export function PanelSection({
  title,
  meta,
  actions,
  defaultOpen = true,
  children,
  className,
}: PanelSectionProps) {
  return (
    <details open={defaultOpen} className={`group relative ${className ?? ''}`}>
      <summary className="-mx-1 flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-sm px-1 text-fg select-none [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon
          size={14}
          className="-rotate-90 text-muted transition-transform duration-(--duration-fast) group-open:rotate-0"
        />
        <h3 className="text-sm font-semibold">
          {title}
          {meta !== undefined && <span className="ml-1 font-normal text-muted">{meta}</span>}
        </h3>
      </summary>
      {actions !== undefined && (
        <div className="absolute top-0 right-0 flex h-8 items-center gap-1">{actions}</div>
      )}
      <div className="mt-2">{children}</div>
    </details>
  )
}
