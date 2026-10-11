import { Link } from 'react-router'
import type { AgentItem } from '../../hooks/useEvents'
import { formatCount } from '../../lib/format'
import { rate, type AgentRow } from '../../lib/histogram'
import { ErrorState } from '../feedback/ErrorState'
import { Skeleton } from '../feedback/Skeleton'
import { AgentAvatar } from '../ui/AgentAvatar'
import { Button } from '../ui/Button'

export interface AgentTableProps {
  items: AgentItem[]
  /** The agent list itself is still loading or failed. */
  agentsLoading: boolean
  agentsFailed: boolean
  /** Every agent failed: show one error for the section instead of a row each. */
  allFailed: boolean
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

function AgentCell({ agent, href, updating }: { agent: string; href: string; updating: boolean }) {
  return (
    <th scope="row" className="px-4 py-1.5 text-left font-medium">
      <Link
        to={href}
        className="inline-flex items-center gap-2 rounded-sm whitespace-nowrap hover:text-accent-text"
      >
        <AgentAvatar name={agent} />
        {agent}
      </Link>
      {updating && <span className="ml-2 text-xs font-normal text-subtle">updating…</span>}
    </th>
  )
}

function NumberCells({ row }: { row: AgentRow }) {
  const errorRate = rate(row.error, row.total)
  const high = errorRate !== null && errorRate >= HIGH_ERROR_RATE
  return (
    <>
      <td className="px-4 py-1.5 text-right font-mono">{formatCount(row.total)}</td>
      <td className="px-4 py-1.5 text-right font-mono whitespace-nowrap">
        <span className={high ? 'font-semibold text-error' : ''}>
          {errorRate === null ? '—' : `${errorRate.toFixed(1)}%`}
        </span>{' '}
        <span className="text-subtle">({formatCount(row.error)})</span>
      </td>
      <td className="hidden px-4 py-1.5 md:table-cell">
        <Sparkline row={row} />
      </td>
    </>
  )
}

/**
 * "Which agent?": every agent's volume and error rate, most errors first. Each row
 * fills in on its own; until then it shows the previous numbers dimmed, or a placeholder.
 */
export function AgentTable({
  items,
  agentsLoading,
  agentsFailed,
  allFailed,
  onRetry,
  hrefFor,
}: AgentTableProps) {
  // Agents with no events for these filters add nothing to the comparison.
  const shown = items.filter((item) => item.state !== 'ready' || item.row.total > 0)
  const loading = items.filter((item) => item.state === 'loading').length

  let body
  if (agentsFailed || allFailed) {
    body = (
      <div className="p-4">
        <ErrorState
          compact
          error={undefined}
          title="Couldn’t load the agent breakdown"
          message="The requests failed after retrying. The cards and chart above are not affected."
          onRetry={onRetry}
        />
      </div>
    )
  } else if (items.length === 0 && agentsLoading) {
    body = (
      <div className="flex flex-col gap-2 p-4" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
    )
  } else if (shown.length === 0) {
    body = <p className="p-4 text-sm text-muted">No agents have events for these filters.</p>
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-busy={loading > 0}>
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
              <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">
                Trend <span className="sr-only">(events and errors over the period)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => (
              <tr
                key={item.agent}
                className={`border-t border-border hover:bg-hover ${item.state === 'ready' ? '' : 'text-muted'}`}
              >
                <AgentCell
                  agent={item.agent}
                  href={hrefFor(item.agent)}
                  updating={item.state === 'loading' && item.row !== null}
                />
                {item.state === 'error' ? (
                  <td colSpan={3} className="px-4 py-1.5">
                    <span className="inline-flex items-center gap-3 text-sm">
                      <span className="text-error">Couldn’t load this agent.</span>
                      <Button size="sm" variant="ghost" onClick={item.retry}>
                        Retry
                      </Button>
                    </span>
                  </td>
                ) : item.row ? (
                  <NumberCells row={item.row} />
                ) : (
                  <td colSpan={3} className="px-4 py-1.5">
                    <Skeleton className="h-4 w-full" />
                  </td>
                )}
              </tr>
            ))}
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
      <div className="flex flex-wrap items-baseline gap-x-3 border-b border-border px-4 py-3">
        <h2 id="agents-heading" className="text-sm font-semibold">
          Which agent
        </h2>
        {shown.length > 0 && (
          <span className="text-sm text-muted">
            {shown.length} {shown.length === 1 ? 'agent' : 'agents'} · most errors first
          </span>
        )}
        <span role="status" className="text-sm text-subtle">
          {loading > 0 ? `Loading ${loading} of ${items.length}…` : ''}
        </span>
      </div>
      {body}
    </section>
  )
}
