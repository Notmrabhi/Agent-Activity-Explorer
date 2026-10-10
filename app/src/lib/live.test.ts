import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, type EventFilters, type EventsPage, type EventSummary } from '../api/types'
import {
  canMergeLocally,
  hasGap,
  matchesFilters,
  prependEvents,
  unseenEvents,
  type ListData,
} from './live'

function event(id: string, second: number, overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id,
    timestamp: new Date(Date.UTC(2026, 9, 10, 12, 0, second)).toISOString(),
    agent: 'billing-bot',
    tool: 'http.get',
    status: 'ok',
    latencyMs: 120,
    argsPreview: '{}',
    ...overrides,
  }
}

function page(items: EventSummary[], total: number, nextCursor: string | null = null): EventsPage {
  return { items, total, nextCursor }
}

function list(...pages: EventsPage[]): ListData {
  return { pages, pageParams: pages.map((_, index) => (index === 0 ? null : `cursor-${index}`)) }
}

const filters = (overrides: Partial<EventFilters>): EventFilters => ({
  ...EMPTY_FILTERS,
  ...overrides,
})
const ids = (data: ListData | undefined) =>
  data?.pages.flatMap((p) => p.items.map((item) => item.id))

describe('matchesFilters', () => {
  it('matches everything without filters', () => {
    expect(matchesFilters(event('a', 0), EMPTY_FILTERS)).toBe(true)
  })

  it('keeps only the selected agents', () => {
    const f = filters({ agents: ['devops', 'billing-bot'] })
    expect(matchesFilters(event('a', 0), f)).toBe(true)
    expect(matchesFilters(event('b', 0, { agent: 'support' }), f)).toBe(false)
  })

  it('keeps only the selected status', () => {
    const f = filters({ status: 'error' })
    expect(matchesFilters(event('a', 0, { status: 'error' }), f)).toBe(true)
    expect(matchesFilters(event('b', 0), f)).toBe(false)
  })

  it('treats `from` as inclusive and `to` as exclusive', () => {
    const f = filters({ from: event('x', 10).timestamp, to: event('x', 20).timestamp })
    expect(matchesFilters(event('a', 9), f)).toBe(false)
    expect(matchesFilters(event('b', 10), f)).toBe(true)
    expect(matchesFilters(event('c', 19), f)).toBe(true)
    expect(matchesFilters(event('d', 20), f)).toBe(false)
  })

  it('rejects an unreadable timestamp', () => {
    expect(matchesFilters(event('a', 0, { timestamp: 'yesterday' }), EMPTY_FILTERS)).toBe(false)
  })

  it('ignores the search text (only the server can match it)', () => {
    expect(matchesFilters(event('a', 0), filters({ q: 'nothing like this' }))).toBe(true)
  })
})

describe('canMergeLocally', () => {
  it('is true without a search, also with other filters', () => {
    expect(canMergeLocally(EMPTY_FILTERS)).toBe(true)
    expect(canMergeLocally(filters({ status: 'error', agents: ['devops'], q: '   ' }))).toBe(true)
  })

  it('is false with a search', () => {
    expect(canMergeLocally(filters({ q: 'stripe' }))).toBe(false)
  })
})

describe('prependEvents', () => {
  const cached = () =>
    list(
      page([event('c', 30), event('b', 20), event('a', 10)], 50, 'next'),
      page([event('z', 5)], 50),
    )

  it('returns undefined data unchanged', () => {
    expect(prependEvents(undefined, [event('n', 40)])).toBeUndefined()
  })

  it('adds new events newest first, above the cached rows', () => {
    const result = prependEvents(cached(), [event('n1', 40), event('n2', 45)])
    expect(ids(result)).toEqual(['n2', 'n1', 'c', 'b', 'a', 'z'])
  })

  it('merges an event older than the top into timestamp order', () => {
    const result = prependEvents(cached(), [event('n', 25)])
    expect(ids(result)).toEqual(['c', 'n', 'b', 'a', 'z'])
  })

  it('skips ids already in the list and duplicates in the batch', () => {
    const result = prependEvents(cached(), [event('c', 30), event('n', 40), event('n', 40)])
    expect(ids(result)).toEqual(['n', 'c', 'b', 'a', 'z'])
  })

  it('raises the total by the number actually added', () => {
    const result = prependEvents(cached(), [event('b', 20), event('n', 40)])
    expect(result?.pages[0]?.total).toBe(51)
  })

  it('returns the same data when nothing is new', () => {
    const data = cached()
    expect(prependEvents(data, [event('a', 10)])).toBe(data)
    expect(prependEvents(data, [])).toBe(data)
  })

  it('leaves later pages, cursors and page params untouched', () => {
    const data = cached()
    const result = prependEvents(data, [event('n', 40)])
    expect(result?.pages[1]).toBe(data.pages[1])
    expect(result?.pages[0]?.nextCursor).toBe('next')
    expect(result?.pageParams).toEqual(data.pageParams)
  })

  it('leaves events older than the first page to pagination when more pages follow', () => {
    const result = prependEvents(cached(), [event('old', 1), event('n', 40)])
    expect(ids(result)).toEqual(['n', 'c', 'b', 'a', 'z'])
  })

  it('adds older events to a single, complete page', () => {
    const data = list(page([event('b', 20)], 1))
    expect(ids(prependEvents(data, [event('old', 1)]))).toEqual(['b', 'old'])
  })
})

describe('unseenEvents', () => {
  it('drops known ids and sorts newest first', () => {
    const data = list(page([event('a', 10)], 1))
    expect(
      unseenEvents(data, [event('n1', 11), event('a', 10), event('n2', 12)]).map((e) => e.id),
    ).toEqual(['n2', 'n1'])
  })
})

describe('hasGap', () => {
  const newest = event('b', 20)

  it('is false when the fresh page reaches the newest cached event', () => {
    expect(hasGap(newest, page([event('n', 30), event('b', 20)], 3, 'next'))).toBe(false)
  })

  it('is false when the fresh page reaches back past it', () => {
    expect(hasGap(newest, page([event('n', 30), event('x', 15)], 3, 'next'))).toBe(false)
  })

  it('is false when the fresh page is the whole list', () => {
    expect(hasGap(newest, page([event('n', 30)], 1))).toBe(false)
  })

  it('is true when a full fresh page is entirely newer', () => {
    expect(hasGap(newest, page([event('n2', 40), event('n1', 30)], 200, 'next'))).toBe(true)
  })

  it('ignores overlap with events streamed after the fetch started', () => {
    // 's' arrived on the stream meanwhile: it is in the page, but the hole is below it.
    expect(hasGap(newest, page([event('s', 40), event('n1', 30)], 200, 'next'))).toBe(true)
  })

  it('is true for a full page over an empty list', () => {
    expect(hasGap(undefined, page([event('n', 30)], 200, 'next'))).toBe(true)
  })
})
