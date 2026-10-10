import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'

/** Automatic retries on top of the first attempt, for transient failures only. */
export const MAX_RETRIES = 2

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return error instanceof ApiError && error.retryable && failureCount < MAX_RETRIES
}

/** Exponential backoff with jitter: ~500 ms, ~1 s (capped at 4 s). */
export function retryDelay(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 4000)
  return base / 2 + Math.random() * (base / 2)
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  })
}
