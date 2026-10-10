import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { EVENT_STATUSES, type EventStatus } from '../../api/types'
import { STATUS_LABELS } from '../../lib/format'
import { Popover } from '../ui/Popover'
import { StatusBadge } from '../ui/StatusBadge'
import { FilterButton } from './FilterButton'

export interface StatusFilterProps {
  /** null = all statuses. */
  value: EventStatus | null
  onChange: (status: EventStatus | null) => void
}

const OPTIONS: readonly (EventStatus | null)[] = [null, ...EVENT_STATUSES]
const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/**
 * Single-select status filter: native radios in a popover, so arrow keys and screen readers
 * work out of the box. A selection applies immediately.
 *
 * Arrow keys move the native radio selection, which fires change events too. Closing on those
 * would shut the popover on the first arrow press, so we track how the change happened:
 * a click, Space or Enter applies and closes (focus back on the trigger); arrows apply and keep
 * the popover open, like a native radio group.
 */
export function StatusFilter({ value, onChange }: StatusFilterProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const fieldsetRef = useRef<HTMLFieldSetElement>(null)
  const popoverId = useId()
  const radioName = useId()
  const intent = useRef<'commit' | 'navigate'>('commit')

  // The Popover focuses its first radio ("All statuses"); start on the checked one instead,
  // as a native radio group would. Child effects run first, so this wins.
  useEffect(() => {
    if (!open) return
    intent.current = 'commit'
    fieldsetRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
  }, [open])

  const closeAndReturnFocus = () => {
    setOpen(false)
    anchorRef.current?.focus()
  }

  const handleChange = (option: EventStatus | null) => {
    onChange(option)
    if (intent.current === 'commit') closeAndReturnFocus()
  }

  // Clicking (or pressing Space on) the option that is already selected fires no change event.
  const handleClick = (option: EventStatus | null) => {
    if (option === value && intent.current === 'commit') closeAndReturnFocus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (ARROW_KEYS.has(event.key)) {
      intent.current = 'navigate'
    } else if (event.key === ' ') {
      intent.current = 'commit'
    } else if (event.key === 'Enter') {
      // Arrows already applied the value; Enter confirms it.
      event.preventDefault()
      closeAndReturnFocus()
    }
  }

  return (
    <div className="relative">
      <FilterButton
        ref={anchorRef}
        label="Status"
        valueLabel={value ? STATUS_LABELS[value] : undefined}
        open={open}
        aria-controls={popoverId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      />
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        label="Filter by status"
        id={popoverId}
        className="w-56 p-1.5"
      >
        <fieldset
          ref={fieldsetRef}
          onPointerDown={() => {
            intent.current = 'commit'
          }}
          onKeyDown={handleKeyDown}
        >
          <legend className="sr-only">Status</legend>
          {OPTIONS.map((option) => (
            <label
              key={option ?? 'all'}
              className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-hover has-checked:bg-selected"
            >
              <input
                type="radio"
                name={radioName}
                value={option ?? 'all'}
                checked={option === value}
                onChange={() => handleChange(option)}
                onClick={() => handleClick(option)}
                className="size-4 shrink-0 accent-accent"
              />
              {option ? (
                <StatusBadge status={option} />
              ) : (
                <span className="text-base">All statuses</span>
              )}
            </label>
          ))}
        </fieldset>
      </Popover>
    </div>
  )
}
