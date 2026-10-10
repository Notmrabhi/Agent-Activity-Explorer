import { formatCount } from '../../lib/format'
import { ChevronUpIcon } from '../ui/icons'

export interface NewEventsPillProps {
  count: number
  /** A search is active: the events can't be counted exactly, showing them reloads the list. */
  needsRefresh: boolean
  onShow: () => void
}

/**
 * Floats over the top of the list while new events wait. Nothing in the list moves until the
 * user clicks it. The live region announces once when events start waiting, not per event.
 */
export function NewEventsPill({ count, needsRefresh, onShow }: NewEventsPillProps) {
  const label = needsRefresh
    ? 'New events · refresh'
    : `${formatCount(count)} new ${count === 1 ? 'event' : 'events'}`
  return (
    <>
      <span role="status" className="sr-only">
        {count > 0 ? 'New events available' : ''}
      </span>
      {count > 0 && (
        <button
          type="button"
          onClick={onShow}
          className="absolute top-12 left-1/2 z-20 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-3.5 text-sm font-medium text-on-accent shadow-popover hover:bg-accent-hover motion-safe:animate-panel-in"
        >
          <ChevronUpIcon size={14} />
          {label}
        </button>
      )}
    </>
  )
}
