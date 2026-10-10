import type { ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { MAX_RETRIES } from '../../lib/queryClient'
import { Button } from '../ui/Button'
import { AlertTriangleIcon } from '../ui/icons'
import { Spinner } from './Spinner'

export interface ErrorStateProps {
  /** Whatever the query threw. ApiError gets a tailored message and its technical detail. */
  error: unknown
  onRetry: () => void
  /** Default "Couldn't load events". */
  title?: string
  /** Overrides the human message derived from `error`. */
  message?: ReactNode
  /** A retry is in flight: the button shows a spinner and ignores clicks. */
  retrying?: boolean
  /** Left-aligned bordered box for the detail panel instead of the centred full-area state. */
  compact?: boolean
  /** Extra actions after "Try again", e.g. a "Close panel" button. */
  actions?: ReactNode
  /** Heading level for the full variant. Default 3. */
  headingLevel?: 2 | 3 | 4
  className?: string
}

/** Plain-language cause, without jargon. The technical line is shown separately in mono. */
function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong while loading.'
  // Retryable errors were already retried by TanStack Query (lib/queryClient.ts), so say so:
  // it tells the user that pressing the button again right away may not help.
  const tried = error.retryable ? ` We tried ${MAX_RETRIES + 1} times.` : ''
  switch (error.kind) {
    case 'timeout':
      return `The activity service didn't respond in time.${tried}`
    case 'network':
      return `The activity service couldn't be reached. Check your connection.${tried}`
    case 'invalid-response':
      return 'The activity service sent a response we couldn’t read.'
    case 'http':
      if (error.status === 429) return `The activity service is busy right now.${tried}`
      if (error.status !== null && error.status >= 500) {
        return `The activity service returned an error.${tried}`
      }
      return 'The activity service rejected the request.'
  }
}

function technicalDetail(error: unknown): string | null {
  if (error instanceof ApiError) return error.detail
  if (error instanceof Error && error.message) return error.message
  return null
}

/**
 * Failed-load state: what happened in plain words, the technical detail in mono, and a way to
 * try again. The text sits in a role="alert" region so it is announced when it appears; the
 * button is outside it so its "Retrying…" label does not re-trigger the alert.
 */
export function ErrorState({
  error,
  onRetry,
  title = 'Couldn’t load events',
  message,
  retrying = false,
  compact = false,
  actions,
  headingLevel = 3,
  className,
}: ErrorStateProps) {
  const detail = technicalDetail(error)
  const text = message ?? describe(error)

  // aria-disabled, not disabled: a disabled button would drop keyboard focus to <body>.
  const retryButton = (
    <Button
      variant="primary"
      size={compact ? 'sm' : 'md'}
      aria-disabled={retrying || undefined}
      icon={retrying ? <Spinner /> : undefined}
      onClick={() => {
        if (!retrying) onRetry()
      }}
    >
      {retrying ? 'Retrying…' : 'Try again'}
    </Button>
  )

  if (compact) {
    return (
      <div className={`rounded-lg border border-border p-3 ${className ?? ''}`}>
        <div role="alert">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-error">
            <AlertTriangleIcon size={16} />
            {title}
          </p>
          <p className="text-sm text-muted">{text}</p>
          {detail !== null && (
            <p className="mt-1 font-mono text-xs break-all text-subtle">{detail}</p>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {retryButton}
          {actions}
        </div>
      </div>
    )
  }

  const Heading = `h${headingLevel}` as const
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center px-8 py-6 text-center ${className ?? ''}`}
    >
      <div role="alert" className="flex flex-col items-center">
        <AlertTriangleIcon size={40} strokeWidth={1.6} className="text-error" />
        <Heading className="mt-3 mb-1.5 text-lg font-semibold text-fg">{title}</Heading>
        <p className="max-w-md text-muted">{text}</p>
        {detail !== null && (
          <p className="mt-1 max-w-md font-mono text-xs break-all text-subtle">{detail}</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {retryButton}
        {actions}
      </div>
    </div>
  )
}
