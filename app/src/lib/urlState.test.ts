import { describe, expect, it } from 'vitest'
import { hasActiveFilters, parseExplorerParams, serializeExplorerParams } from './urlState'

const parse = (query: string) => parseExplorerParams(new URLSearchParams(query))

describe('parseExplorerParams', () => {
  it('reads every field', () => {
    expect(
      parse(
        'q=stripe&agent=b&agent=a&status=error&from=2026-10-09T11:00:00.000Z&to=2026-10-09T12:00:00.000Z&event=evt_1',
      ),
    ).toEqual({
      filters: {
        q: 'stripe',
        agents: ['a', 'b'],
        status: 'error',
        from: '2026-10-09T11:00:00.000Z',
        to: '2026-10-09T12:00:00.000Z',
      },
      eventId: 'evt_1',
    })
  })

  it('gives empty filters for an empty URL', () => {
    expect(parse('')).toEqual({
      filters: { q: '', agents: [], status: null, from: null, to: null },
      eventId: null,
    })
  })

  it('drops an unknown status and bad dates instead of trusting them', () => {
    const { filters } = parse('status=maybe&from=yesterday&to=2026-02-30T10:00')
    expect(filters.status).toBeNull()
    expect(filters.from).toBeNull()
    expect(filters.to).toBeNull()
  })

  it('removes duplicate and blank agents', () => {
    expect(parse('agent=a&agent=a&agent=%20&agent=b').filters.agents).toEqual(['a', 'b'])
  })

  it('drops the end of an inverted range and keeps the start', () => {
    const { filters } = parse('from=2026-10-09T12:00:00Z&to=2026-10-09T11:00:00Z')
    expect(filters.from).toBe('2026-10-09T12:00:00.000Z')
    expect(filters.to).toBeNull()
  })

  it('reads a time without a zone as UTC', () => {
    expect(parse('from=2026-10-09T11:00').filters.from).toBe('2026-10-09T11:00:00.000Z')
  })
})

describe('serializeExplorerParams', () => {
  it('round-trips through parse', () => {
    const query =
      'q=stripe&agent=a&agent=b&status=blocked&from=2026-10-09T11%3A00%3A00.000Z&event=evt_1'
    expect(serializeExplorerParams(parse(query)).toString()).toBe(query)
  })

  it('writes equal views as equal URLs (sorted agents, no empty params)', () => {
    const params = serializeExplorerParams({
      filters: { q: '  ', agents: ['b', 'a'], status: null, from: null, to: null },
      eventId: null,
    })
    expect(params.toString()).toBe('agent=a&agent=b')
  })
})

describe('hasActiveFilters', () => {
  it('ignores a search of only spaces', () => {
    expect(hasActiveFilters({ q: '  ', agents: [], status: null, from: null, to: null })).toBe(false)
  })

  it('is true for any one filter', () => {
    expect(hasActiveFilters({ q: '', agents: [], status: 'ok', from: null, to: null })).toBe(true)
  })
})
