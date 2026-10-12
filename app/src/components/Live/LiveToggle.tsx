import type { LiveStatus } from '../../hooks/useLiveStream'

export interface LiveToggleProps {
  on: boolean
  status: LiveStatus
  /** On, but new events are waiting because the list is scrolled down. */
  paused?: boolean
  onToggle: () => void
}

const STATUS_TEXT: Record<LiveStatus, string> = {
  off: 'Off',
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
}

/** Announced when the connection changes (the button's name stays "Live updates"). */
const ANNOUNCEMENT: Record<LiveStatus, string> = {
  off: '',
  connecting: 'Live updates connecting',
  live: 'Live updates on',
  reconnecting: 'Live updates interrupted, reconnecting',
}

const DOT: Record<LiveStatus, string> = {
  off: 'bg-subtle',
  connecting: 'bg-blocked',
  live: 'bg-ok',
  reconnecting: 'bg-blocked',
}

/** Turns live updates from /stream on and off, and shows the connection state. */
export function LiveToggle({ on, status, paused = false, onToggle }: LiveToggleProps) {
  const isPaused = on && paused && status === 'live'
  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        title={
          isPaused
            ? 'Paused while you are scrolled down. Scroll to the top to resume.'
            : on
              ? 'Stop live updates'
              : 'Show new events as they arrive'
        }
        className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm font-medium transition-colors duration-(--duration-fast) ${
          on
            ? 'border-accent bg-accent-soft text-accent-text'
            : 'border-control bg-surface text-fg hover:bg-hover'
        }`}
      >
        <span aria-hidden="true" className="relative inline-flex size-2">
          <span className={`size-2 rounded-full ${isPaused ? 'bg-blocked' : DOT[status]}`} />
          {status === 'live' && !isPaused && (
            <span className="absolute inset-0 rounded-full bg-ok opacity-60 motion-safe:animate-ping" />
          )}
        </span>
        Live
        <span className="sr-only"> updates</span>
        {on && status !== 'live' && (
          <span aria-hidden="true" className="text-xs font-normal text-muted">
            {STATUS_TEXT[status]}
          </span>
        )}
        {isPaused && (
          <span aria-hidden="true" className="text-xs font-normal text-muted">
            · paused
          </span>
        )}
      </button>
      <span role="status" className="sr-only" data-live-status={status}>
        {on ? (isPaused ? 'Live updates paused while you read' : ANNOUNCEMENT[status]) : ''}
      </span>
    </>
  )
}
