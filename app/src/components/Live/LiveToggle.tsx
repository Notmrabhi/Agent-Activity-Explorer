import type { LiveStatus } from '../../hooks/useLiveStream'

export interface LiveToggleProps {
  on: boolean
  status: LiveStatus
  onToggle: () => void
}

const STATUS_TEXT: Record<LiveStatus, string> = {
  off: 'Off',
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
}

const DOT: Record<LiveStatus, string> = {
  off: 'bg-subtle',
  connecting: 'bg-blocked',
  live: 'bg-ok motion-safe:animate-pulse',
  reconnecting: 'bg-blocked',
}

/** Turns live updates from /stream on and off, and shows the connection state. */
export function LiveToggle({ on, status, onToggle }: LiveToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title={on ? 'Stop live updates' : 'Show new events as they arrive'}
      className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm font-medium transition-colors duration-(--duration-fast) ${
        on ? 'border-accent bg-accent-soft text-accent-text' : 'border-control bg-surface text-fg hover:bg-hover'
      }`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${DOT[status]}`} />
      Live
      <span className="sr-only">updates, {STATUS_TEXT[status]}</span>
      {on && status !== 'live' && (
        <span aria-hidden="true" className="text-xs font-normal text-muted">
          {STATUS_TEXT[status]}
        </span>
      )}
    </button>
  )
}
