import type { ReactNode } from 'react'
import { Button } from '../ui/Button'
import { ClockIcon } from '../ui/icons'

export interface SlowNoticeProps {
  /** Default "The activity service is responding slowly. Still waiting…". */
  message?: ReactNode
  /** Shows a "Retry now" button: cancel the slow request and start a fresh one. */
  onRetry?: () => void
  /** Shows a "Cancel" button: stop waiting (keep whatever is already on screen). */
  onCancel?: () => void
  className?: string
}

/**
 * Amber notice shown once a request has been running for 2.5 s (useSlowFlag). It is a polite
 * status, not an alert: nothing has failed yet.
 */
export function SlowNotice({
  message = 'The activity service is responding slowly. Still waiting…',
  onRetry,
  onCancel,
  className,
}: SlowNoticeProps) {
  const hasActions = onRetry !== undefined || onCancel !== undefined
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg px-3.5 py-3 text-warning ${className ?? ''}`}
    >
      <ClockIcon size={18} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Taking longer than usual</p>
        <p className="mt-0.5 text-sm">{message}</p>
        {hasActions && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {onRetry && (
              <Button size="sm" onClick={onRetry}>
                Retry now
              </Button>
            )}
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
