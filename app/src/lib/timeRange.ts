// Time-range filter logic: presets, UTC <input> conversion, validation and labels. Pure
// functions so the edge cases (time zones, open ends, bad input) can be unit tested.
//
// Everything here is UTC. The table shows UTC times, so the range the user types must be read in
// the same zone; reading a datetime-local value as the viewer's local time would make the same
// link (and the same typed numbers) mean different events in different offices.
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

/**
 * Date.parse rolls impossible dates over ("2026-02-30" → Mar 2) instead of rejecting them, so
 * check the YYYY-MM-DD prefix against the real calendar.
 */
function isCalendarDate(value: string): boolean {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * A URL `from`/`to` value → canonical ISO UTC ("2026-10-09T11:00:00.000Z"), or null if invalid.
 *
 * Only ISO 8601 is accepted: Date.parse alone also takes "Oct 9 2026" and similar, which it
 * reads in the viewer's local zone, so one link would mean different ranges to different people.
 * A date-time without a zone is read as UTC, since every time on screen is UTC.
 */
export function normalizeTimestamp(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!ISO_TIMESTAMP.test(trimmed) || !isCalendarDate(trimmed)) return null
  const withZone = ZONELESS_DATE_TIME.test(trimmed) ? `${trimmed}Z` : trimmed
  const ms = Date.parse(withZone)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/**
 * Range for a quick preset, counted back from `anchorIso` (the newest event, not the wall clock:
 * the dataset is historical, so "the last hour" by the clock would always be empty).
 *
 * - The start is rounded down to the minute, so the label ("Since Oct 09 11:23") is exact and the
 *   value round-trips through the minute-precision custom-range inputs unchanged.
 * - The end is left open (`to: null`) rather than set to the anchor: `to` is exclusive, so it
 *   would cut off the very newest event, and events that arrive later still belong to "since".
 *
 * Returns null if the anchor is not a valid timestamp.
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

/**
 * A datetime-local value read as UTC → ISO, or null when empty or invalid.
 *
 * The zone is appended by hand (never `new Date(value)`, which would use local time), and the
 * result must round-trip: Date.parse rolls impossible dates like Feb 30 over to March.
 */
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

/**
 * Validate the custom-range inputs. Both ends are optional; a non-empty value must be a valid
 * date-time, and when both are set the start must be strictly before the end (`to` is exclusive,
 * so from == to can never match anything). Returns an empty object when the range is valid.
 */
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

/**
 * Short UTC label parts, reusing the table's format so the button reads like the rows:
 * "Oct 09 · 11:00:00.000" → day "Oct 09", time "11:00". Seconds are kept only when set
 * (a hand-edited link), so the label never claims a rounder time than the filter uses.
 */
function labelParts(iso: string): { day: string; time: string } {
  const [day = iso, time = ''] = formatTimestampUtc(iso).split(' · ')
  return { day, time: time.replace(/\.000$/, '').replace(/^(\d{2}:\d{2}):00$/, '$1') }
}

/**
 * Compact label for the filter button, in UTC:
 * "Oct 09 11:00 → 12:00", "Oct 08 23:00 → Oct 09 01:00", "Since Oct 09 11:23",
 * "Until Oct 09 12:00". Empty string when there is no range.
 */
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

/**
 * The range as words for sentences such as the empty state ("Nothing for “stripe” between …"):
 * "between Oct 09 11:00 and 12:00 UTC", "since Oct 09 11:23 UTC", "before Oct 09 12:00 UTC"
 * (`to` is exclusive, so "before", not "until"). Empty string when there is no range.
 */
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
