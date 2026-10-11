// Plain-language formatting of arbitrary JSON for non-developers (the Readable view).
import { formatBytes } from './format'

const ACRONYMS = new Set(['id', 'url', 'api', 'http', 'sql', 'pr', 'ip', 'json', 'csv', 's3'])

/** "content-type" → "Content type", "topK" → "Top k", "pr_id" → "PR ID". */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
  if (words.length === 0) return key
  return words
    .map((word, i) => {
      if (ACRONYMS.has(word)) return word.toUpperCase()
      return i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    })
    .join(' ')
}

const HTTP_REASONS: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No content',
  301: 'Moved',
  302: 'Redirected',
  304: 'Not modified',
  400: 'Bad request',
  401: 'Not signed in',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict',
  429: 'Too many requests',
  500: 'Server error',
  502: 'Bad gateway',
  503: 'Unavailable',
  504: 'Timed out',
}

export function describeHttpStatus(code: number): string {
  return HTTP_REASONS[code] ?? (code < 400 ? 'Success' : 'Failed')
}

export type ReadableValue =
  | { kind: 'text'; text: string; hint?: string }
  | { kind: 'link'; href: string; site: string; path: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/** A URL with an http(s) scheme, or null. */
export function parseUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value)) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** A primitive with its meaning: sizes, status codes, yes/no, links, dates in local time. */
export function readablePrimitive(key: string, value: unknown): ReadableValue {
  if (value === null) return { kind: 'text', text: 'None' }
  if (typeof value === 'boolean') return { kind: 'text', text: value ? 'Yes' : 'No' }
  if (typeof value === 'number') {
    const k = key.toLowerCase()
    if (k === 'bytes' || k.endsWith('bytes') || k === 'size') {
      return {
        kind: 'text',
        text: formatBytes(value),
        hint: `${value.toLocaleString('en-US')} bytes`,
      }
    }
    if ((k === 'status' || k.endsWith('status')) && value >= 100 && value < 600) {
      return { kind: 'text', text: `${value} · ${describeHttpStatus(value)}` }
    }
    if (k.endsWith('ms')) return { kind: 'text', text: `${value.toLocaleString('en-US')} ms` }
    return { kind: 'text', text: value.toLocaleString('en-US') }
  }
  if (typeof value === 'string') {
    const url = parseUrl(value)
    if (url) {
      const path = `${url.pathname === '/' ? '' : url.pathname}${url.search}`
      return { kind: 'link', href: url.href, site: url.host, path }
    }
    if (ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))) {
      return {
        kind: 'text',
        text: new Date(value).toLocaleString(undefined, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
        hint: 'your time',
      }
    }
    if (key.toLowerCase() === 'content-type' && value.includes('json')) {
      return { kind: 'text', text: 'JSON' }
    }
    return { kind: 'text', text: value }
  }
  return { kind: 'text', text: String(value) }
}

/** An array of plain objects that share at least one key: shown as a table. */
export function tableColumns(items: readonly unknown[]): string[] | null {
  if (items.length === 0) return null
  const columns: string[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'object' && value !== null) return null
      if (!columns.includes(key)) columns.push(key)
    }
  }
  return columns.length > 0 && columns.length <= 6 ? columns : null
}
