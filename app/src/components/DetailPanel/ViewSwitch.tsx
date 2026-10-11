import { useId } from 'react'

export type PayloadView = 'formatted' | 'json'

export interface ViewSwitchProps {
  value: PayloadView
  onChange: (value: PayloadView) => void
}

const OPTIONS: readonly { value: PayloadView; label: string }[] = [
  { value: 'formatted', label: 'Formatted' },
  { value: 'json', label: 'JSON' },
]

// The radio is visually hidden, so its focus ring goes on the label.
const SEGMENT =
  'flex h-7 cursor-pointer items-center rounded-sm px-2.5 text-sm font-medium text-muted select-none hover:text-fg has-checked:bg-surface has-checked:text-fg has-checked:shadow-segment has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent'

/** One switch for the whole panel: Arguments and Result change together. */
export function ViewSwitch({ value, onChange }: ViewSwitchProps) {
  const name = useId()
  return (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <span className="text-xs text-muted">View</span>
      <fieldset className="inline-flex rounded-md bg-sunken p-0.5">
        <legend className="sr-only">Show arguments and result as</legend>
        {OPTIONS.map((option) => (
          <label key={option.value} className={SEGMENT}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
    </div>
  )
}
