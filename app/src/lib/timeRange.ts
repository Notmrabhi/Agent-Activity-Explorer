// Everything is UTC, like the table: local time would make one link mean different events in
// different time zones.
import type { TimeRange } from '../api/types'
import { formatTimestampUtc } from './format'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

export interface QuickRange {
  id: string
  label: string
  durationMs: number
}

export const QUICK_RANGES: readonly QuickRange[] = [
  { id: '15m', label: 'Last 15 minutes', durationMs: 15 * MINUTE_MS },
  { id: '1h', label: 'Last hour', durationMs: HOUR_MS },
  { id: '6h', label: 'Last 6 hours', durationMs: 6 * HOUR_MS },
  { id: '24h', label: 'Last 24 hours', durationMs: 24 * HOUR_MS },
]

/** "2026-10-09T11:00", with optional seconds and fraction, and no zone. */
const ZONELESS_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/
/** ISO 8601 date or date-time as the URL may carry it: zone optional (Z or ±hh:mm). */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/

/** Date.parse rolls "2026-02-30" over to Mar 2 instead of rejecting it. */
function isCalendarDate(value: string): boolean {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * URL `from`/`to` → canonical ISO UTC, or null. Only ISO 8601: Date.parse also reads "Oct 9 2026"
 * in local time. No zone means UTC.
 */
export function normalizeTimestamp(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!ISO_TIMESTAMP.test(trimmed) || !isCalendarDate(trimmed)) return null
  const withZone = ZONELESS_DATE_TIME.test(trimmed) ? `${trimmed}Z` : trimmed
  const ms = Date.parse(withZone)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/**
 * Counted back from the newest event, not the clock (the data is historical). Start rounded to the
 * minute; end left open, since `to` is exclusive and would cut off the newest event.
 */
export function presetRange(anchorIso: string, durationMs: number): TimeRange | null {
  const anchor = Date.parse(anchorIso)
  if (Number.isNaN(anchor)) return null
  const start = Math.floor((anchor - durationMs) / MINUTE_MS) * MINUTE_MS
  return { from: new Date(start).toISOString(), to: null }
}

/** ISO → "YYYY-MM-DDTHH:mm" (UTC) for <input type="datetime-local">. '' for null or invalid. */
export function toUtcInputValue(iso: string | null): string {
  if (iso === null) return ''
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 16)
}

/** datetime-local value read as UTC (never `new Date(value)`, which uses local time). */
export function fromUtcInputValue(value: string): string | null {
  const trimmed = value.trim()
  if (!ZONELESS_DATE_TIME.test(trimmed)) return null
  const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed
  const ms = Date.parse(`${withSeconds}Z`)
  if (Number.isNaN(ms)) return null
  const iso = new Date(ms).toISOString()
  return iso.slice(0, 16) === trimmed.slice(0, 16) ? iso : null
}

export interface RangeErrors {
  from?: string
  to?: string
  /** Problem with the pair rather than one field (start not before end). */
  form?: string
}

export const RANGE_MESSAGES = {
  invalid: 'Enter a valid date and time',
  order: 'Start must be before end',
} as const

/** Both ends optional; start must be strictly before end (`to` is exclusive). */
export function validateRange(fromInput: string, toInput: string): RangeErrors {
  const errors: RangeErrors = {}
  const from = fromUtcInputValue(fromInput)
  const to = fromUtcInputValue(toInput)
  if (fromInput.trim() !== '' && from === null) errors.from = RANGE_MESSAGES.invalid
  if (toInput.trim() !== '' && to === null) errors.to = RANGE_MESSAGES.invalid
  if (from !== null && to !== null && Date.parse(from) >= Date.parse(to)) {
    errors.form = RANGE_MESSAGES.order
  }
  return errors
}

export function hasRangeErrors(errors: RangeErrors): boolean {
  return errors.from !== undefined || errors.to !== undefined || errors.form !== undefined
}

/** "Oct 09 · 11:00:00.000" → day "Oct 09", time "11:00". Seconds kept only when set. */
function labelParts(iso: string): { day: string; time: string } {
  const [day = iso, time = ''] = formatTimestampUtc(iso).split(' · ')
  return { day, time: time.replace(/\.000$/, '').replace(/^(\d{2}:\d{2}):00$/, '$1') }
}

/** "Oct 09 11:00 → 12:00", "Since Oct 09 11:23", "Until Oct 09 12:00". */
export function describeRange(from: string | null, to: string | null): string {
  const start = from === null ? null : labelParts(from)
  const end = to === null ? null : labelParts(to)
  if (start && end) {
    const endText = start.day === end.day ? end.time : `${end.day} ${end.time}`
    return `${start.day} ${start.time} → ${endText}`
  }
  if (start) return `Since ${start.day} ${start.time}`
  if (end) return `Until ${end.day} ${end.time}`
  return ''
}

/** "between Oct 09 11:00 and 12:00 UTC", "since …", "before …" (`to` is exclusive). */
export function describeRangeInWords(from: string | null, to: string | null): string {
  const start = from === null ? null : labelParts(from)
  const end = to === null ? null : labelParts(to)
  if (start && end) {
    const endText = start.day === end.day ? end.time : `${end.day} ${end.time}`
    return `between ${start.day} ${start.time} and ${endText} UTC`
  }
  if (start) return `since ${start.day} ${start.time} UTC`
  if (end) return `before ${end.day} ${end.time} UTC`
  return ''
}

/** "Oct 09 · 12:23" for the quick-range hint: the anchor to the minute, like the presets. */
export function formatAnchor(iso: string): string {
  const { day, time } = labelParts(iso)
  return `${day} · ${time.slice(0, 5)}`
}
