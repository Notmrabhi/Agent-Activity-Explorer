import { describe, expect, it } from 'vitest'
import { formatCount, formatLatency, formatTimestampUtc } from './format'
import {
  describeRange,
  fromUtcInputValue,
  normalizeTimestamp,
  presetRange,
  toUtcInputValue,
  validateRange,
} from './timeRange'

describe('normalizeTimestamp', () => {
  it('accepts ISO with or without a zone and returns canonical UTC', () => {
    expect(normalizeTimestamp('2026-10-09T11:00:00Z')).toBe('2026-10-09T11:00:00.000Z')
    expect(normalizeTimestamp('2026-10-09T16:30:00+05:30')).toBe('2026-10-09T11:00:00.000Z')
    expect(normalizeTimestamp('2026-10-09T11:00')).toBe('2026-10-09T11:00:00.000Z')
  })

  it('rejects other formats and impossible dates', () => {
    expect(normalizeTimestamp('Oct 9 2026')).toBeNull()
    expect(normalizeTimestamp('2026-02-30')).toBeNull()
    expect(normalizeTimestamp('')).toBeNull()
    expect(normalizeTimestamp(null)).toBeNull()
  })
})

describe('presetRange', () => {
  it('counts back from the newest event, rounded down to the minute, with an open end', () => {
    expect(presetRange('2026-10-09T12:23:45.678Z', 60 * 60_000)).toEqual({
      from: '2026-10-09T11:23:00.000Z',
      to: null,
    })
  })

  it('returns null for a bad anchor', () => {
    expect(presetRange('nope', 60_000)).toBeNull()
  })
})

describe('UTC input values', () => {
  it('round-trips through the datetime-local format', () => {
    const iso = '2026-10-09T11:05:00.000Z'
    expect(fromUtcInputValue(toUtcInputValue(iso))).toBe(iso)
  })

  it('rejects an impossible date instead of rolling it over', () => {
    expect(fromUtcInputValue('2026-02-30T10:00')).toBeNull()
  })
})

describe('validateRange', () => {
  it('accepts open ends', () => {
    expect(validateRange('', '')).toEqual({})
    expect(validateRange('2026-10-09T11:00', '')).toEqual({})
  })

  it('flags bad input per field and a start that is not before the end', () => {
    expect(validateRange('bad', '')).toEqual({ from: 'Enter a valid date and time' })
    expect(validateRange('2026-10-09T12:00', '2026-10-09T12:00')).toEqual({
      form: 'Start must be before end',
    })
  })
})

describe('describeRange', () => {
  it('reads like the table, and drops the day when both ends share it', () => {
    expect(describeRange('2026-10-09T11:00:00.000Z', '2026-10-09T12:00:00.000Z')).toBe(
      'Oct 09 11:00 → 12:00',
    )
    expect(describeRange('2026-10-09T11:23:00.000Z', null)).toBe('Since Oct 09 11:23')
    expect(describeRange(null, null)).toBe('')
  })
})

describe('format', () => {
  it('formats times in UTC, latency and counts', () => {
    expect(formatTimestampUtc('2026-10-09T11:59:59.266Z')).toBe('Oct 09 · 11:59:59.266')
    expect(formatLatency(102)).toBe('102 ms')
    expect(formatLatency(1240)).toBe('1.24 s')
    expect(formatLatency(-1)).toBe('—')
    expect(formatCount(50000)).toBe('50,000')
  })
})
