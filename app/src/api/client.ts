// The only place that calls fetch(). Adds a request timeout, typed errors and response guards.
import { readErrorMessage } from './guards'

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export const REQUEST_TIMEOUT_MS = 20_000

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'invalid-response'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** HTTP status, or null when the request never got a response. */
  readonly status: number | null

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }

  get retryable(): boolean {
    if (this.kind === 'network' || this.kind === 'timeout') return true
    if (this.kind === 'http' && this.status !== null)
      return this.status >= 500 || this.status === 429
    return false
  }

  get isNotFound(): boolean {
    return this.kind === 'http' && this.status === 404
  }

  /** Short technical detail for the UI, e.g. "HTTP 500 · internal server error". */
  get detail(): string {
    if (this.kind === 'http') return `HTTP ${this.status ?? '?'} · ${this.message}`
    if (this.kind === 'timeout') return `No response after ${REQUEST_TIMEOUT_MS / 1000} s`
    if (this.kind === 'network') return 'Network error · the API could not be reached'
    return `Unexpected response · ${this.message}`
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** `signal` aborts when the query is cancelled, so a stale response can't overwrite a newer one. */
export async function apiGet<T>(
  path: string,
  guard: (value: unknown) => value is T,
  options: { params?: URLSearchParams; signal?: AbortSignal } = {},
): Promise<T> {
  const url = new URL(path, API_BASE_URL)
  if (options.params) url.search = options.params.toString()

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (timeout.aborted) throw new ApiError('timeout', 'Request timed out')
    throw new ApiError('network', error instanceof Error ? error.message : 'Network error')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (!response.ok)
      throw new ApiError('http', response.statusText || 'Request failed', response.status)
    throw new ApiError('invalid-response', 'Response was not JSON', response.status)
  }

  if (!response.ok) {
    const message = readErrorMessage(body) || response.statusText || 'Request failed'
    throw new ApiError('http', message, response.status)
  }
  if (!guard(body)) {
    throw new ApiError('invalid-response', `Unexpected shape from ${path}`, response.status)
  }
  return body
}
