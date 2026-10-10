import type { ComponentPropsWithRef } from 'react'
import { ChevronDownIcon } from '../ui/icons'

export interface FilterButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  label: string
  count?: number
  valueLabel?: string
  open: boolean
}

const BASE =
  'inline-flex h-(--control-height) shrink-0 items-center gap-2 rounded-md border pr-2.5 pl-3 text-base font-medium whitespace-nowrap transition-colors duration-(--duration-fast)'

const ACTIVE = 'border-accent bg-accent-soft text-accent-text hover:border-accent-hover'
const INACTIVE = 'border-control bg-surface text-fg hover:bg-hover aria-expanded:bg-hover'

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
