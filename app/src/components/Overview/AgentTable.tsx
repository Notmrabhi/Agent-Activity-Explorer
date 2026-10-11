import { Link } from 'react-router'
import { formatCount } from '../../lib/format'
import { rate, type AgentRow } from '../../lib/histogram'
import { ErrorState } from '../feedback/ErrorState'
import { Skeleton } from '../feedback/Skeleton'
import { AgentAvatar } from '../ui/AgentAvatar'

export interface AgentTableProps {
  rows: AgentRow[]
  isLoading: boolean
  isError: boolean
  isStale: boolean
  onRetry: () => void
  /** Link to the Events view filtered to one agent. */
  hrefFor: (agent: string) => string
}

/** Error rates at or above this stand out in the table. */
const HIGH_ERROR_RATE = 12

const WIDTH = 140
const HEIGHT = 24

function points(values: readonly number[], max: number): string {
  if (values.length < 2) return ''
  return values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * WIDTH
      const y = HEIGHT - 2 - (value / Math.max(1, max)) * (HEIGHT - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function Sparkline({ row }: { row: AgentRow }) {
  const max = Math.max(1, ...row.trend)
  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      <polyline
        points={points(row.trend, max)}
        fill="none"
        className="stroke-subtle"
        strokeWidth={1.2}
      />
      <polyline
        points={points(row.errorTrend, max)}
        fill="none"
        className="stroke-error"
        strokeWidth={1.6}
      />
    </svg>
  )
}

/** "Which agent?": every agent's volume and error and block rates, most errors first. */
export function AgentTable({
  rows,
  isLoading,
  isError,
  isStale,
  onRetry,
  hrefFor,
}: AgentTableProps) {
  let body
  if (rows.length === 0 && isLoading) {
    body = (
      <div className="flex flex-col gap-2 p-4" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
    )
  } else if (rows.length === 0 && isError) {
    body = (
      <div className="p-4">
        <ErrorState
          compact
          error={undefined}
          title="Couldn’t load the agent breakdown"
          message="Some requests failed after retrying. The cards and chart above are not affected."
          onRetry={onRetry}
        />
      </div>
    )
  } else if (rows.length === 0) {
    body = <p className="p-4 text-sm text-muted">No agents have events for these filters.</p>
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${isStale ? 'opacity-60' : ''}`}>
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr className="text-left">
              <th scope="col" className="px-4 py-2 font-medium">
                Agent
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Events
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium" aria-sort="descending">
                Errors
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Blocked
              </th>
              <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">
                Trend <span className="sr-only">(events and errors over the period)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const errorRate = rate(row.error, row.total)
              const blockedRate = rate(row.blocked, row.total)
              const high = errorRate !== null && errorRate >= HIGH_ERROR_RATE
              return (
                <tr key={row.agent} className="border-t border-border hover:bg-hover">
                  <th scope="row" className="px-4 py-1.5 text-left font-medium">
                    <Link
                      to={hrefFor(row.agent)}
                      className="inline-flex items-center gap-2 rounded-sm whitespace-nowrap hover:text-accent-text"
                    >
                      <AgentAvatar name={row.agent} />
                      {row.agent}
                    </Link>
                  </th>
                  <td className="px-4 py-1.5 text-right font-mono">{formatCount(row.total)}</td>
                  <td className="px-4 py-1.5 text-right font-mono whitespace-nowrap">
                    <span className={high ? 'font-semibold text-error' : ''}>
                      {errorRate === null ? '—' : `${errorRate.toFixed(1)}%`}
                    </span>{' '}
                    <span className="text-subtle">({formatCount(row.error)})</span>
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono text-muted">
                    {blockedRate === null ? '—' : `${blockedRate.toFixed(1)}%`}
                  </td>
                  <td className="hidden px-4 py-1.5 md:table-cell">
                    <Sparkline row={row} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <section
      aria-labelledby="agents-heading"
      className="rounded-lg border border-border bg-surface"
    >
      <div className="flex items-baseline gap-3 border-b border-border px-4 py-3">
        <h2 id="agents-heading" className="text-sm font-semibold">
          Which agent
        </h2>
        {rows.length > 0 && (
          <span className="text-sm text-muted">
            {rows.length} {rows.length === 1 ? 'agent' : 'agents'} · most errors first
          </span>
        )}
      </div>
      {body}
    </section>
  )
}
