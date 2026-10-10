import type { ComponentType } from 'react'
import type { EventStatus } from '../../api/types'
import { STATUS_LABELS } from '../../lib/format'
import { AlertTriangleIcon, BlockedIcon, CheckCircleIcon, type IconProps } from './icons'

export interface StatusBadgeProps {
  status: EventStatus
  /** 'sm' (22px) for table rows, 'md' (24px) for the detail panel. Default 'sm'. */
  size?: 'sm' | 'md'
  className?: string
}

// Status is always colour + icon + word, so it never relies on colour alone.
const TONES: Record<EventStatus, { className: string; Icon: ComponentType<IconProps> }> = {
  ok: { className: 'bg-ok-bg text-ok', Icon: CheckCircleIcon },
  blocked: { className: 'bg-blocked-bg text-blocked', Icon: BlockedIcon },
  error: { className: 'bg-error-bg text-error', Icon: AlertTriangleIcon },
}

const SIZES = {
  sm: 'h-[22px] gap-1.5 pr-2 pl-1.5 text-xs',
  md: 'h-6 gap-1.5 pr-2.5 pl-2 text-sm',
} as const

/** Status lozenge: "✓ OK", "⊘ Blocked", "⚠ Error". The word is the accessible text. */
export function StatusBadge({ status, size = 'sm', className }: StatusBadgeProps) {
  const { className: tone, Icon } = TONES[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium whitespace-nowrap ${tone} ${SIZES[size]} ${className ?? ''}`}
    >
      <Icon size={14} strokeWidth={2.4} />
      {STATUS_LABELS[status]}
    </span>
  )
}
