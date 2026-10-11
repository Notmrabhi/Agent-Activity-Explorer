import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import type { TimeRange } from '../../api/types'
import { useNewestEventTime } from '../../hooks/useEvents'
import {
  QUICK_RANGES,
  describeRange,
  formatAnchor,
  fromUtcInputValue,
  hasRangeErrors,
  presetRange,
  toUtcInputValue,
  validateRange,
  type RangeErrors,
} from '../../lib/timeRange'
import { Spinner } from '../feedback/Spinner'
import { Button } from '../ui/Button'
import { AlertTriangleIcon, CheckIcon } from '../ui/icons'
import { Popover } from '../ui/Popover'
import { FilterButton } from './FilterButton'

export interface TimeRangeFilterProps {
  from: string | null
  to: string | null
  onChange: (range: TimeRange) => void
}

const INPUT =
  'h-8 min-w-0 flex-1 rounded-md border border-control bg-surface px-2 font-mono text-data text-fg aria-invalid:border-error'

const OPTION =
  'flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-base enabled:hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50'

/** A half-typed datetime-local reports '', which would look empty instead of invalid. */
function readInput(input: HTMLInputElement | null, text: string): string {
  return input?.validity.badInput ? 'incomplete' : text
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 flex items-start gap-1.5 pl-13 text-xs text-error">
      <AlertTriangleIcon size={12} className="mt-0.5" />
      {children}
    </p>
  )
}

export function TimeRangeFilter({ from, to, onChange }: TimeRangeFilterProps) {
  const newest = useNewestEventTime()
  const [open, setOpen] = useState(false)
  const [fromText, setFromText] = useState('')
  const [toText, setToText] = useState('')
  const [errors, setErrors] = useState<RangeErrors>({})
  const [submitted, setSubmitted] = useState(false)

  const anchorRef = useRef<HTMLButtonElement>(null)
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)
  const popoverId = useId()
  const quickLabelId = useId()
  const fromId = useId()
  const toId = useId()
  const fromErrorId = useId()
  const toErrorId = useId()
  const formErrorId = useId()

  const active = from !== null || to !== null
  const label = describeRange(from, to)
  const anchor = newest.data

  const openPopover = () => {
    setFromText(toUtcInputValue(from))
    setToText(toUtcInputValue(to))
    setErrors({})
    setSubmitted(false)
    setOpen(true)
  }

  const closeAndReturnFocus = () => {
    setOpen(false)
    anchorRef.current?.focus()
  }

  const apply = (range: TimeRange) => {
    onChange(range)
    closeAndReturnFocus()
  }

  const revalidate = (nextFrom: string, nextTo: string) => {
    if (submitted) setErrors(validateRange(nextFrom, nextTo))
  }
  const handleFromChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFromText(event.target.value)
    revalidate(readInput(event.target, event.target.value), readInput(toRef.current, toText))
  }
  const handleToChange = (event: ChangeEvent<HTMLInputElement>) => {
    setToText(event.target.value)
    revalidate(readInput(fromRef.current, fromText), readInput(event.target, event.target.value))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fromInput = readInput(fromRef.current, fromText)
    const toInput = readInput(toRef.current, toText)
    const nextErrors = validateRange(fromInput, toInput)
    setErrors(nextErrors)
    setSubmitted(true)
    if (hasRangeErrors(nextErrors)) {
      if (nextErrors.from !== undefined || nextErrors.form !== undefined) fromRef.current?.focus()
      else toRef.current?.focus()
      return
    }
    // An untouched field keeps its exact URL value (it may carry seconds the input can't show).
    const resolve = (input: string, current: string | null) =>
      input === toUtcInputValue(current) ? current : fromUtcInputValue(input)
    apply({ from: resolve(fromInput, from), to: resolve(toInput, to) })
  }

  let anchorStatus: ReactNode
  if (anchor === undefined && newest.isError) {
    anchorStatus = (
      <div className="px-2 pt-1 pb-1.5 text-sm">
        <p role="alert" className="flex items-start gap-2">
          <AlertTriangleIcon size={16} className="mt-px text-error" />
          <span>
            <span className="font-medium text-error">Couldn’t load the newest event time.</span>{' '}
            <span className="text-muted">A custom range still works.</span>
          </span>
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          aria-disabled={newest.isFetching || undefined}
          icon={newest.isFetching ? <Spinner /> : undefined}
          onClick={() => {
            if (!newest.isFetching) void newest.refetch()
          }}
        >
          {newest.isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    )
  } else if (anchor === undefined) {
    anchorStatus = (
      <p role="status" className="flex items-center gap-2 px-2 pt-1 pb-1.5 text-xs text-muted">
        <Spinner size={12} />
        Finding the newest event…
      </p>
    )
  } else if (anchor === null) {
    anchorStatus = (
      <p className="px-2 pt-1 pb-1.5 text-xs text-muted">No events yet to count back from.</p>
    )
  } else {
    anchorStatus = (
      <p className="px-2 pt-1 pb-1.5 text-xs text-muted">
        Counted back from the newest event (
        <span className="font-mono">{formatAnchor(anchor)}</span> UTC)
      </p>
    )
  }

  const describedBy = (fieldErrorId: string, fieldError: string | undefined) =>
    [fieldError ? fieldErrorId : null, errors.form ? formErrorId : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="relative">
      <FilterButton
        ref={anchorRef}
        label="Time"
        valueLabel={label || undefined}
        // The name starts with the visible text so voice control can target it (WCAG 2.5.3).
        aria-label={active ? `Time: ${label} UTC` : undefined}
        open={open}
        aria-controls={popoverId}
        onClick={() => (open ? setOpen(false) : openPopover())}
      />
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        label="Filter by time"
        id={popoverId}
        align="end"
        className="w-80"
      >
        <div role="group" aria-labelledby={quickLabelId} className="p-1.5">
          <p id={quickLabelId} className="px-2 pt-1 pb-1 text-xs font-medium text-muted">
            Quick ranges
          </p>
          <ul>
            {QUICK_RANGES.map((quick) => {
              const range = anchor ? presetRange(anchor, quick.durationMs) : null
              const applied = range !== null && to === null && from === range.from
              return (
                <li key={quick.id}>
                  <button
                    type="button"
                    disabled={range === null}
                    onClick={() => {
                      if (range) apply(range)
                    }}
                    className={`${OPTION} ${applied ? 'bg-selected' : ''}`}
                  >
                    <span className="flex-1">{quick.label}</span>
                    {applied && (
                      <>
                        <CheckIcon size={14} className="text-accent-text" />
                        <span className="sr-only">(applied)</span>
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          {anchorStatus}
        </div>

        <form noValidate onSubmit={handleSubmit} className="border-t border-border p-3">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-muted">Custom range (UTC)</legend>
            <div className="flex flex-col gap-2">
              <div>
                <div className="flex items-center gap-3">
                  <label htmlFor={fromId} className="w-10 shrink-0 text-sm text-fg">
                    From
                  </label>
                  <input
                    ref={fromRef}
                    id={fromId}
                    type="datetime-local"
                    step={60}
                    value={fromText}
                    onChange={handleFromChange}
                    aria-invalid={
                      errors.from !== undefined || errors.form !== undefined || undefined
                    }
                    aria-describedby={describedBy(fromErrorId, errors.from)}
                    className={INPUT}
                  />
                </div>
                {errors.from && <FieldError id={fromErrorId}>{errors.from}</FieldError>}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <label htmlFor={toId} className="w-10 shrink-0 text-sm text-fg">
                    To
                  </label>
                  <input
                    ref={toRef}
                    id={toId}
                    type="datetime-local"
                    step={60}
                    value={toText}
                    onChange={handleToChange}
                    aria-invalid={errors.to !== undefined || errors.form !== undefined || undefined}
                    aria-describedby={describedBy(toErrorId, errors.to)}
                    className={INPUT}
                  />
                </div>
                {errors.to && <FieldError id={toErrorId}>{errors.to}</FieldError>}
              </div>
            </div>
            {errors.form && <FieldError id={formErrorId}>{errors.form}</FieldError>}
          </fieldset>

          <div className="mt-3 flex items-center gap-2">
            {active && (
              <Button variant="ghost" size="sm" onClick={() => apply({ from: null, to: null })}>
                Clear time range
              </Button>
            )}
            <Button type="submit" variant="primary" size="sm" className="ml-auto">
              Apply
            </Button>
          </div>
        </form>
      </Popover>
    </div>
  )
}
