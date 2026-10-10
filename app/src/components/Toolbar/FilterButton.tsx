import type { ComponentPropsWithRef } from 'react'
import { ChevronDownIcon } from '../ui/icons'

export interface FilterButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  /** Dimension name, e.g. "Agent". */
  label: string
  /** Number of selected values (multi-select). Shown as a badge when > 0. */
  count?: number
  /** Chosen value (single-select), e.g. "Error". Shown after the label. */
  valueLabel?: string
  /** Whether the popover this button controls is open. */
  open: boolean
}

const BASE =
  'inline-flex h-(--control-height) shrink-0 items-center gap-2 rounded-md border pr-2.5 pl-3 text-base font-medium whitespace-nowrap transition-colors duration-(--duration-fast)'

// Active = a filter is applied on this dimension, so it reads as "on" at a glance (Jira-style).
const ACTIVE = 'border-accent bg-accent-soft text-accent-text hover:border-accent-hover'
const INACTIVE = 'border-control bg-surface text-fg hover:bg-hover aria-expanded:bg-hover'

/**
 * Trigger for a filter popover: "Agent (2) ▾" or "Status: Error ▾". Pass `ref` to use it as
 * the Popover anchor, and `aria-controls` with the popover id.
 */
export function FilterButton({
  label,
  count = 0,
  valueLabel,
  open,
  type = 'button',
  className,
  ...rest
}: FilterButtonProps) {
  const active = count > 0 || Boolean(valueLabel)
  return (
    <button
      type={type}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={`${BASE} ${active ? ACTIVE : INACTIVE} ${className ?? ''}`}
      {...rest}
    >
      <span>
        {label}
        {valueLabel && (
          <>
            : <span className="font-semibold">{valueLabel}</span>
          </>
        )}
      </span>
      {count > 0 && (
        <>
          {/* The bare number reads badly ("Agent 2"); screen readers get "Agent, 2 selected". */}
          <span
            aria-hidden="true"
            className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs leading-none text-on-accent"
          >
            {count}
          </span>
          <span className="sr-only">, {count} selected</span>
        </>
      )}
      <ChevronDownIcon
        size={14}
        className={`motion-safe:transition-transform motion-safe:duration-(--duration-fast) ${open ? 'rotate-180' : ''}`}
      />
    </button>
  )
}
