import type { ComponentType } from 'react'
import { Link } from 'react-router'
import type { EventStatus } from '../../api/types'
import { formatCount } from '../../lib/format'
import { rate, rateDelta, type StatusTotals } from '../../lib/histogram'
import { Skeleton } from '../feedback/Skeleton'
import { AlertTriangleIcon, BlockedIcon, CheckCircleIcon, type IconProps } from '../ui/icons'

export interface HealthCardsProps {
  totals: StatusTotals | null
  /** The period of the same length just before; null when there is no time range to compare. */
  previous: StatusTotals | null
  /** "6 h", "45 min": the length of the compared periods. */
  periodLabel: string | null
  /** The status filter, if one is set: the other status cards say they are filtered out. */
  statusFilter: EventStatus | null
  /** The previous period is still loading. */
  comparing: boolean
  isLoading: boolean
  /** Link to the Events view filtered to a status (null = all statuses). */
  hrefFor: (status: EventStatus | null) => string
}

const CARDS: readonly {
  status: EventStatus
  label: string
  Icon: ComponentType<IconProps>
  tone: string
  /** A rising rate is bad news for errors and blocks, good news for OK. */
  higherIsWorse: boolean
}[] = [
  {
    status: 'error',
    label: 'Errors',
    Icon: AlertTriangleIcon,
    tone: 'text-error',
    higherIsWorse: true,
  },
  {
    status: 'blocked',
    label: 'Blocked',
    Icon: BlockedIcon,
    tone: 'text-blocked',
    higherIsWorse: true,
  },
  { status: 'ok', label: 'OK', Icon: CheckCircleIcon, tone: 'text-ok', higherIsWorse: false },
]

/** Percentage points a rate must move by before it is highlighted as worse. */
const NOTABLE_CHANGE_PTS = 1

const CARD =
  'flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3.5 text-fg'

function formatRate(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`
}

function Delta({
  points,
  higherIsWorse,
  periodLabel,
  comparing,
}: {
  points: number | null
  higherIsWorse: boolean
  periodLabel: string | null
  comparing: boolean
}) {
  if (comparing && periodLabel !== null) {
    return <span className="text-xs text-subtle">Comparing with the previous {periodLabel}…</span>
  }
  if (periodLabel === null) {
    return <span className="text-xs text-subtle">Pick a time range to compare</span>
  }
  if (points === null) {
    return (
      <span className="text-xs text-subtle">
        No events in the previous {periodLabel} to compare
      </span>
    )
  }
  if (Math.abs(points) < 0.05) {
    return <span className="text-xs text-muted">No change vs previous {periodLabel}</span>
  }
  // Small moves are noise; only a change of a point or more is called out.
  const worse = points > 0 === higherIsWorse && Math.abs(points) >= NOTABLE_CHANGE_PTS
  return (
    <span className={`text-xs ${worse ? 'font-medium text-error' : 'text-muted'}`}>
      {points > 0 ? '↑' : '↓'} {Math.abs(points).toFixed(1)} pts vs previous {periodLabel}
    </span>
  )
}

/** "Is something wrong?": totals and status rates, each compared with the period before. */
export function HealthCards({
  totals,
  previous,
  periodLabel,
  statusFilter,
  comparing,
  isLoading,
  hrefFor,
}: HealthCardsProps) {
  if (!totals) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={isLoading}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px] rounded-lg" />
        ))}
      </div>
    )
  }

  const totalChange =
    previous && previous.total > 0 && periodLabel !== null
      ? ((totals.total - previous.total) / previous.total) * 100
      : null

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Health">
      <li className="contents">
        <Link to={hrefFor(null)} className={`${CARD} hover:border-control`}>
          <span className="text-sm text-muted">Events</span>
          <span className="font-mono text-2xl font-medium">{formatCount(totals.total)}</span>
          {comparing && periodLabel !== null ? (
            <span className="text-xs text-subtle">Comparing with the previous {periodLabel}…</span>
          ) : totalChange === null ? (
            <span className="text-xs text-subtle">
              {periodLabel === null
                ? 'Pick a time range to compare'
                : `No events in the previous ${periodLabel} to compare`}
            </span>
          ) : (
            <span className="text-xs text-muted">
              {totalChange >= 0 ? '↑' : '↓'} {Math.abs(totalChange).toFixed(0)}% vs previous{' '}
              {periodLabel}
            </span>
          )}
        </Link>
      </li>
      {CARDS.map(({ status, label, Icon, tone, higherIsWorse }) => {
        if (statusFilter !== null && statusFilter !== status) {
          return (
            <li key={status} className={`${CARD} opacity-60`}>
              <span className="flex items-center gap-1.5 text-sm text-muted">
                <Icon size={14} className={tone} />
                {label}
              </span>
              <span className="text-sm text-muted">Hidden by the Status filter</span>
            </li>
          )
        }
        const now = rate(totals[status], totals.total)
        const before = previous ? rate(previous[status], previous.total) : null
        return (
          <li key={status} className="contents">
            <Link to={hrefFor(status)} className={`${CARD} hover:border-control`}>
              <span className="flex items-center gap-1.5 text-sm text-muted">
                <Icon size={14} className={tone} />
                {label}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-medium">{formatRate(now)}</span>
                <span className="text-sm text-muted">{formatCount(totals[status])} calls</span>
              </span>
              <Delta
                points={rateDelta(now, before)}
                higherIsWorse={higherIsWorse}
                periodLabel={periodLabel}
                comparing={comparing}
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
