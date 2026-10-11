import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../api/client'
import type { EventStatus, EventSummary } from '../api/types'
import { createQueryClient } from '../lib/queryClient'
import OverviewPage from './OverviewPage'

// Two agents over four hours: beta has fewer events but far more errors.
function makeEvents(agent: string, count: number, errors: number, blocked: number): EventSummary[] {
  return Array.from({ length: count }, (_, i) => {
    const status: EventStatus = i < errors ? 'error' : i < errors + blocked ? 'blocked' : 'ok'
    return {
      id: `${agent}_${i}`,
      timestamp: new Date(Date.UTC(2026, 9, 9, 8) + i * 60_000).toISOString(),
      agent,
      tool: 'http.request',
      status,
      latencyMs: 100,
      argsPreview: '{}',
    }
  })
}
const EVENTS = [...makeEvents('alpha', 120, 6, 6), ...makeEvents('beta', 80, 16, 4)]

let failAgentHistograms = false
let failAgent: string | null = null

function matching(url: URL): EventSummary[] {
  const agents = url.searchParams.getAll('agent')
  const status = url.searchParams.get('status')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  return EVENTS.filter(
    (e) =>
      (agents.length === 0 || agents.includes(e.agent)) &&
      (!status || e.status === status) &&
      (!from || e.timestamp >= from) &&
      (!to || e.timestamp < to),
  )
}

const server = setupServer(
  http.get(`${API_BASE_URL}/events/histogram`, ({ request }) => {
    const url = new URL(request.url)
    if (
      (failAgentHistograms && url.searchParams.has('agent')) ||
      (failAgent !== null && url.searchParams.get('agent') === failAgent)
    ) {
      return HttpResponse.json({ error: 'internal server error' }, { status: 500 })
    }
    const counts = new Map<string, number>()
    for (const e of matching(url)) {
      const hour = `${e.timestamp.slice(0, 13)}:00:00Z`
      counts.set(hour, (counts.get(hour) ?? 0) + 1)
    }
    return HttpResponse.json({
      bucket: url.searchParams.get('bucket') ?? '1m',
      buckets: [...counts].map(([t, count]) => ({ t, count })),
    })
  }),
  http.get(`${API_BASE_URL}/events`, ({ request }) => {
    const items = [...matching(new URL(request.url))].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    )
    return HttpResponse.json({ items: items.slice(0, 1), nextCursor: null, total: items.length })
  }),
  http.get(`${API_BASE_URL}/agents`, () => HttpResponse.json(['alpha', 'beta'])),
)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
})
afterAll(() => server.close())
beforeEach(() => {
  failAgentHistograms = false
  failAgent = null
})
afterEach(() => server.resetHandlers())

function renderOverview(url = '/overview') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="*" element={<p>Events view</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const cards = () => screen.getByRole('list', { name: 'Health' })

describe('OverviewPage', () => {
  it('shows totals and status rates', async () => {
    renderOverview()
    await waitFor(() => expect(cards()).toHaveTextContent('200'))
    // 22 errors of 200 events, 10 blocked.
    expect(cards()).toHaveTextContent('11.0%')
    expect(cards()).toHaveTextContent('5.0%')
    expect(cards()).toHaveTextContent('Pick a time range to compare')
  })

  it('lists agents with the most errors first and links each to its events', async () => {
    renderOverview()
    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3))
    const [first, second] = within(table).getAllByRole('rowheader')
    expect(first).toHaveTextContent('beta')
    expect(second).toHaveTextContent('alpha')
    expect(within(first as HTMLElement).getByRole('link')).toHaveAttribute('href', '/?agent=beta')
  })

  it('drills into Events from a status card, keeping the other filters', async () => {
    renderOverview('/overview?q=http')
    await waitFor(() => expect(cards()).toHaveTextContent('Errors'))
    const errors = within(cards()).getByRole('link', { name: /Errors/ })
    expect(errors).toHaveAttribute('href', '/?q=http&status=error')
  })

  it('says which cards a status filter hides', async () => {
    renderOverview('/overview?status=error')
    await waitFor(() => expect(cards()).toHaveTextContent('22'))
    expect(within(cards()).getAllByText('Hidden by the Status filter')).toHaveLength(2)
  })

  it('compares with the previous period of the same length', async () => {
    // Second half of the data against the first half.
    renderOverview('/overview?from=2026-10-09T09:40:00.000Z&to=2026-10-09T11:20:00.000Z')
    await waitFor(() => expect(cards()).toHaveTextContent('vs previous 100 min'))
  })

  it('keeps the cards when only the agent breakdown fails', async () => {
    failAgentHistograms = true
    renderOverview()
    await screen.findByText('Couldn’t load the agent breakdown', undefined, { timeout: 8000 })
    expect(cards()).toHaveTextContent('200')
  }, 15_000)

  it('shows the other agents when one agent fails, with a retry on its row', async () => {
    failAgent = 'beta'
    renderOverview()
    const table = await screen.findByRole('table')
    const betaRow = await within(table).findByText('Couldn’t load this agent.', undefined, {
      timeout: 8000,
    })
    expect(
      within(betaRow.closest('tr') as HTMLElement).getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()
    const alpha = within(table)
      .getByRole('rowheader', { name: /alpha/ })
      .closest('tr') as HTMLElement
    expect(alpha).toHaveTextContent('120')
  }, 15_000)

  it('keeps filters when switching to Events, but not the open event', async () => {
    renderOverview('/overview?status=error&event=evt_1')
    const nav = screen.getByRole('navigation', { name: 'Views' })
    expect(within(nav).getByRole('link', { name: 'Events' })).toHaveAttribute(
      'href',
      '/?status=error',
    )
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
