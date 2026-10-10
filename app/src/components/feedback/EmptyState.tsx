import type { ReactNode } from 'react'
import { SearchOffIcon } from '../ui/icons'

export interface EmptyStateProps {
  /** e.g. "No events match your filters". */
  title: string
  /** Say which filters produced nothing, e.g. Nothing for “stripe” from <b>hr-onboarding</b>. */
  description?: ReactNode
  /** Buttons, e.g. a primary "Clear all filters" and secondary "Remove status filter". */
  actions?: ReactNode
  /** Default: magnifier with a minus, 40px, subtle. */
  icon?: ReactNode
  /** Heading level that fits the surrounding outline. Default 3. */
  headingLevel?: 2 | 3 | 4
  className?: string
}

/** Centred "nothing here" message with a way out. Fills its container (flex-1). */
export function EmptyState({
  title,
  description,
  actions,
  icon,
  headingLevel = 3,
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center px-8 py-6 text-center ${className ?? ''}`}
    >
      <span className="flex text-subtle">
        {icon ?? <SearchOffIcon size={40} strokeWidth={1.6} />}
      </span>
      <Heading className="mt-3 mb-1.5 text-lg font-semibold text-fg">{title}</Heading>
      {description !== undefined && <p className="max-w-md text-muted">{description}</p>}
      {actions !== undefined && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>
      )}
    </div>
  )
}
