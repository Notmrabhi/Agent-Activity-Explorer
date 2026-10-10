import { formatCount } from '../../lib/format'
import { ChevronUpIcon } from '../ui/icons'

export interface NewEventsPillProps {
  count: number
  /** Too many waiting to merge: showing them reloads the first page. */
  needsRefresh: boolean
  refreshing: boolean
  failed: boolean
  onShow: () => void
}

/** In the header row, so it never covers a data row. Announces once, not per event. */
export function NewEventsPill({
  count,
  needsRefresh,
  refreshing,
  failed,
  onShow,
}: NewEventsPillProps) {
  const visible = count > 0 || needsRefresh
  const events = `${formatCount(count)} new ${count === 1 ? 'event' : 'events'}`
  let label = needsRefresh ? 'New events · refresh' : events
  let name = needsRefresh ? 'Show new events (reloads the list)' : `Show ${events}`
  if (refreshing) label = name = 'Loading new events…'
  else if (failed) {
    label = 'Couldn’t load new events · retry'
    name = 'Couldn’t load new events. Retry'
  }
  let announcement = ''
  if (failed) announcement = 'Couldn’t load new events'
  else if (visible) announcement = 'New events available'
  return (
    <>
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {visible && (
        <button
          type="button"
          onClick={refreshing ? undefined : onShow}
          aria-label={name}
          aria-disabled={refreshing || undefined}
          className="absolute top-0.5 right-2 z-20 inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-sm font-medium text-on-accent shadow-popover hover:bg-accent-hover motion-safe:animate-panel-in"
        >
          <ChevronUpIcon size={14} />
          {label}
        </button>
      )}
    </>
  )
}
