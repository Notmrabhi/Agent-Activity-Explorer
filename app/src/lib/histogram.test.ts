import { describe, expect, it } from 'vitest'
import { BUCKET_MS, chooseBucket, fillGaps, rangeForBuckets } from './histogram'

const HOUR = BUCKET_MS['1h']

describe('chooseBucket', () => {
  it('uses hours without a start', () => {
    expect(chooseBucket({ from: null, to: null }, '2026-10-10T08:00:00Z')).toBe('1h')
  })

  it('gets finer as the range gets shorter', () => {
    const newest = '2026-10-10T08:00:00.000Z'
    expect(chooseBucket({ from: '2026-10-10T06:00:00.000Z', to: null }, newest)).toBe('1m')
    expect(chooseBucket({ from: '2026-10-09T20:00:00.000Z', to: null }, newest)).toBe('5m')
    expect(chooseBucket({ from: '2026-10-08T00:00:00.000Z', to: null }, newest)).toBe('1h')
  })

  it('measures to `to` when it is set', () => {
    expect(
      chooseBucket({ from: '2026-10-08T00:00:00.000Z', to: '2026-10-08T01:00:00.000Z' }, null),
    ).toBe('1m')
  })
})

describe('fillGaps', () => {
  it('puts the empty buckets the API leaves out back as zeros', () => {
    const filled = fillGaps(
      [
        { t: '2026-10-07T17:00:00Z', count: 1 },
        { t: '2026-10-07T19:00:00Z', count: 4 },
      ],
      HOUR,
    )
    expect(filled.map((bucket) => bucket.count)).toEqual([1, 0, 4])
    expect(filled[1]?.t).toBe('2026-10-07T18:00:00.000Z')
  })

  it('sorts buckets that arrive out of order', () => {
    const filled = fillGaps(
      [
        { t: '2026-10-07T19:00:00Z', count: 4 },
        { t: '2026-10-07T18:00:00Z', count: 2 },
      ],
      HOUR,
    )
    expect(filled.map((bucket) => bucket.count)).toEqual([2, 4])
  })

  it('returns nothing for no buckets', () => {
    expect(fillGaps([], HOUR)).toEqual([])
  })
})

describe('rangeForBuckets', () => {
  const buckets = fillGaps(
    [
      { t: '2026-10-07T12:00:00Z', count: 1 },
      { t: '2026-10-07T14:00:00Z', count: 1 },
    ],
    HOUR,
  )

  it('runs from the first bucket to the end of the last (to is exclusive)', () => {
    expect(rangeForBuckets(buckets, 0, 1, HOUR)).toEqual({
      from: '2026-10-07T12:00:00.000Z',
      to: '2026-10-07T14:00:00.000Z',
    })
  })

  it('works when dragged right to left', () => {
    expect(rangeForBuckets(buckets, 2, 0, HOUR)).toEqual(rangeForBuckets(buckets, 0, 2, HOUR))
  })

  it('selects one bucket on a click', () => {
    expect(rangeForBuckets(buckets, 1, 1, HOUR)).toEqual({
      from: '2026-10-07T13:00:00.000Z',
      to: '2026-10-07T14:00:00.000Z',
    })
  })

  it('returns null outside the buckets', () => {
    expect(rangeForBuckets(buckets, 0, 9, HOUR)).toBeNull()
  })
})
