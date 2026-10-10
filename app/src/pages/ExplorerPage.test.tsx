import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../api/client'
import type { EventSummary } from '../api/types'
import { createQueryClient } from '../lib/queryClient'
import ExplorerPage from './ExplorerPage'

// A small fake of the mock API: 250 events, newest first, pages of 20 (the real one returns up
// to `limit`; a short page lets the list ask for more without scrolling, which jsdom can't do).
const PAGE = 20
const EVENTS: EventSummary[] = Array.from({ length: 250 }, (_, i) => ({
  id: `evt_${String(i).padStart(3, '0')}`,
  timestamp: new Date(Date.UTC(2026, 9, 9, 12) - i * 1000).toISOString(),
  agent: i % 2 ? 'billing-bot' : 'devops-runner',
  tool: 'http.request',
  status: i % 10 === 0 ? 'error' : 'ok',
  latencyMs: 100 + i,
  argsPreview: `{"n":${i}}`,
}))

const requests: URL[] = []
let failNext = 0 // how many list requests answer 500 before succeeding
let failCursorPages = false

function eventsHandler({ request }: { request: Request }) {
  const url = new URL(request.url)
  requests.push(url)
  if (failNext > 0 && url.searchParams.get('limit') !== '1') {
    failNext--
    return HttpResponse.json({ error: 'internal server error' }, { status: 500 })
  }
  if (failCursorPages && url.searchParams.has('cursor')) {
    return HttpResponse.json({ error: 'internal server error' }, { status: 500 })
  }
  const q = url.searchParams.get('q') ?? ''
  const status = url.searchParams.get('status')
  const from = url.searchParams.get('from')
  const matching = EVENTS.filter(
    (event) =>
      (!status || event.status === status) &&
      (!q || event.argsPreview.includes(q)) &&
      (!from || event.timestamp >= from),
  )
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const items = matching.slice(start, start + PAGE)
  const next = start + PAGE < matching.length ? String(start + PAGE) : null
  return HttpResponse.json({ items, nextCursor: next, total: matching.length })
}

const server = setupServer(
  http.get(`${API_BASE_URL}/events`, eventsHandler),
  http.get(`${API_BASE_URL}/events/:id`, ({ params }) => {
    const event = EVENTS.find((item) => item.id === params.id)
    if (!event) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    return HttpResponse.json({ ...event, args: { n: 1 }, result: { ok: true }, policyMatches: [] })
  }),
  http.get(`${API_BASE_URL}/agents`, () => HttpResponse.json(['billing-bot', 'devops-runner'])),
)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  // jsdom has no layout: report a wide screen (docked panel) and make scrolling a no-op.
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('min-width'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  Element.prototype.scrollTo = () => {}
  Element.prototype.scrollBy = () => {}
})
afterAll(() => server.close())
beforeEach(() => {
  requests.length = 0
  failNext = 0
  failCursorPages = false
})
afterEach(() => server.resetHandlers())

let location = ''
function LocationProbe() {
  const { search } = useLocation()
  useEffect(() => {
    location = search
  }, [search])
  return null
}

function renderPage(url = '/') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <ExplorerPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const row = (id: string) => document.getElementById(`event-row-${id}`)

describe('ExplorerPage', () => {
  it('loads pages until the window is filled and shows the total', async () => {
    renderPage()
    await waitFor(() => expect(row('evt_000')).toBeInTheDocument())
    await waitFor(() => expect(document.body).toHaveTextContent(/of 250 events/))
    const cursors = requests.map((url) => url.searchParams.get('cursor'))
    expect(cursors[0]).toBeNull()
    expect(cursors).toContain('20')
  })

  it('sends the filters from the URL to the API', async () => {
    renderPage('/?status=error')
    await waitFor(() => expect(row('evt_000')).toBeInTheDocument())
    expect(row('evt_001')).toBeNull()
    expect(requests.some((url) => url.searchParams.get('status') === 'error')).toBe(true)
  })

  it('explains an empty result and clears the filters', async () => {
    const user = userEvent.setup()
    renderPage('/?q=nothing-matches')
    const clear = await screen.findByRole('button', { name: 'Clear all filters' })
    await user.click(clear)
    await waitFor(() => expect(row('evt_000')).toBeInTheDocument())
    expect(location).toBe('')
  })

  it(
    'shows an error after the automatic retries, and Try again recovers',
    { timeout: 15_000 },
    async () => {
      const user = userEvent.setup()
      failNext = 3 // the first attempt and both retries
      renderPage()
      const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 10_000 })
      expect(screen.getByText('Couldn’t load events')).toBeInTheDocument()
      await user.click(retry)
      await waitFor(() => expect(row('evt_000')).toBeInTheDocument())
    },
  )

  it('says when a time range starts after the newest event', async () => {
    renderPage('/?from=2026-10-10T00:00:00Z')
    expect(
      await screen.findByText(/The newest event is from/, undefined, { timeout: 5000 }),
    ).toHaveTextContent('Oct 09 · 12:00 UTC')
  })

  it('keeps loaded rows when the next page fails, and offers Retry', async () => {
    failCursorPages = true
    renderPage()
    await screen.findByText('Couldn’t load more events.', undefined, { timeout: 5000 })
    expect(row('evt_000')).toBeInTheDocument()
    expect(row('evt_019')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('opens the panel from a row, puts the event in the URL, and Esc returns focus to the row', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(row('evt_003')).toBeInTheDocument())
    await user.click(row('evt_003') as HTMLElement)
    expect(location).toContain('event=evt_003')
    const panel = await screen.findByRole('dialog', { name: /http\.request/i })
    await waitFor(() =>
      expect(within(panel).getAllByText(/devops-runner|billing-bot/).length).toBeGreaterThan(0),
    )
    await user.keyboard('{Escape}')
    await waitFor(() => expect(location).not.toContain('event='))
    await act(async () => {})
    expect(document.activeElement).toBe(row('evt_003'))
  })

  it('opens the panel from a shared link before the list has loaded that row', async () => {
    renderPage('/?event=evt_200')
    expect(await screen.findByRole('dialog', { name: /http\.request/i })).toBeInTheDocument()
  })
})
