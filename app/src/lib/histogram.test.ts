import { describe, expect, it } from 'vitest'
import {
  agentRow,
  BUCKET_MS,
  bucketReady,
  chooseBucket,
  compareAgentRows,
  fillGaps,
  mergeStatusHistograms,
  previousRange,
  rangeForBuckets,
  rate,
  rateDelta,
  sumStatuses,
} from './histogram'

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

describe('mergeStatusHistograms', () => {
  it('puts each status on one even axis and adds a total', () => {
    const merged = mergeStatusHistograms(
      {
        ok: [{ t: '2026-10-07T12:00:00Z', count: 10 }],
        error: [{ t: '2026-10-07T14:00:00Z', count: 2 }],
      },
      HOUR,
    )
    expect(merged.map((b) => [b.ok, b.blocked, b.error, b.total])).toEqual([
      [10, 0, 0, 10],
      [0, 0, 0, 0],
      [0, 0, 2, 2],
    ])
  })

  it('uses a shared axis when given, so several agents line up', () => {
    const axis = [
      { t: '2026-10-07T12:00:00Z', count: 0 },
      { t: '2026-10-07T15:00:00Z', count: 0 },
    ]
    const merged = mergeStatusHistograms(
      { ok: [{ t: '2026-10-07T13:00:00Z', count: 4 }] },
      HOUR,
      axis,
    )
    expect(merged.map((b) => b.total)).toEqual([0, 4, 0, 0])
  })
})

describe('totals and rates', () => {
  const buckets = mergeStatusHistograms(
    {
      ok: [{ t: '2026-10-07T12:00:00Z', count: 90 }],
      blocked: [{ t: '2026-10-07T12:00:00Z', count: 4 }],
      error: [{ t: '2026-10-07T12:00:00Z', count: 6 }],
    },
    HOUR,
  )

  it('sums every status', () => {
    expect(sumStatuses(buckets)).toEqual({ total: 100, ok: 90, blocked: 4, error: 6 })
  })

  it('gives a rate in percent, or null with nothing to divide', () => {
    expect(rate(6, 100)).toBe(6)
    expect(rate(0, 0)).toBeNull()
  })

  it('gives the change in points, or null when either side is unknown', () => {
    expect(rateDelta(8, 6)).toBe(2)
    expect(rateDelta(null, 6)).toBeNull()
  })
})

describe('previousRange', () => {
  it('is the same length, just before', () => {
    expect(previousRange('2026-10-08T12:00:00.000Z', '2026-10-08T18:00:00.000Z')).toEqual({
      from: '2026-10-08T06:00:00.000Z',
      to: '2026-10-08T12:00:00.000Z',
    })
  })

  it('needs both ends and a positive length', () => {
    expect(previousRange(null, '2026-10-08T18:00:00.000Z')).toBeNull()
    expect(previousRange('2026-10-08T12:00:00.000Z', null)).toBeNull()
    expect(previousRange('2026-10-08T12:00:00.000Z', '2026-10-08T12:00:00.000Z')).toBeNull()
  })
})

describe('bucketReady', () => {
  it('waits for the newest event only for an open-ended range', () => {
    expect(bucketReady({ from: null, to: null }, undefined)).toBe(true)
    expect(
      bucketReady({ from: '2026-10-08T12:00:00Z', to: '2026-10-08T13:00:00Z' }, undefined),
    ).toBe(true)
    expect(bucketReady({ from: '2026-10-08T12:00:00Z', to: null }, undefined)).toBe(false)
    expect(bucketReady({ from: '2026-10-08T12:00:00Z', to: null }, '2026-10-10T08:00:00Z')).toBe(
      true,
    )
  })
})

describe('agentRow', () => {
  const axis = [
    { t: '2026-10-07T12:00:00.000Z' },
    { t: '2026-10-07T13:00:00.000Z' },
    { t: '2026-10-07T14:00:00.000Z' },
  ]
  const all = [
    { t: '2026-10-07T12:00:00Z', count: 10 },
    { t: '2026-10-07T14:00:00Z', count: 6 },
  ]

  it('sums both histograms and lines the trends up on the shared axis', () => {
    const row = agentRow('alpha', all, [{ t: '2026-10-07T14:00:00Z', count: 2 }], false, axis)
    expect(row).toEqual({
      agent: 'alpha',
      total: 16,
      error: 2,
      trend: [10, 0, 6],
      errorTrend: [0, 0, 2],
    })
  })

  it('counts every event as an error under an Error status filter, and none under the others', () => {
    expect(agentRow('alpha', all, null, true, axis)).toMatchObject({
      error: 16,
      errorTrend: [10, 0, 6],
    })
    expect(agentRow('alpha', all, null, false, axis)).toMatchObject({
      error: 0,
      errorTrend: [0, 0, 0],
    })
  })

  it('sorts by most errors, then most events, then name', () => {
    const rows = [
      agentRow('quiet', all, [{ t: '2026-10-07T12:00:00Z', count: 1 }], false, axis),
      agentRow('noisy', all, [{ t: '2026-10-07T12:00:00Z', count: 5 }], false, axis),
      agentRow(
        'busy',
        [...all, { t: '2026-10-07T13:00:00Z', count: 9 }],
        [{ t: '2026-10-07T12:00:00Z', count: 1 }],
        false,
        axis,
      ),
    ].sort(compareAgentRows)
    expect(rows.map((r) => r.agent)).toEqual(['noisy', 'busy', 'quiet'])
  })
})
