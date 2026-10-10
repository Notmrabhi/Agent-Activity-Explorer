// Display formatting. Times in the table are UTC so a shared link shows the same times to
// everyone; the detail panel also shows the viewer's local time.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

/** "2026-10-09T11:59:59.266Z" → "Oct 09 · 11:59:59.266". Returns the input if it is not a date. */
export function formatTimestampUtc(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const day = `${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCDate())}`
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
  return `${day} · ${time}`
}

/** Viewer's local date and time with zone, e.g. "9 Oct 2026, 17:29:59 GMT+5:30". */
export function formatLocalDateTime(iso: string, locale?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  })
}

/** 102 → "102 ms", 1240 → "1.24 s", 30000 → "30.0 s". */
export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(2)} s`
  return `${(ms / 1000).toFixed(1)} s`
}

/** Latency at or above this is visually emphasised in the table. */
export const SLOW_LATENCY_MS = 1000

const countFormat = new Intl.NumberFormat('en-US')

/** 50000 → "50,000". */
export function formatCount(value: number): string {
  return countFormat.format(value)
}

/** 2048 → "2.0 KB". Used for large JSON payload notices. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const STATUS_LABELS = { ok: 'OK', blocked: 'Blocked', error: 'Error' } as const
