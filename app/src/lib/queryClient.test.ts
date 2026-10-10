import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { retryDelay, shouldRetry } from './queryClient'

describe('shouldRetry', () => {
  it('retries 5xx, 429, network and timeout errors twice', () => {
    for (const error of [
      new ApiError('http', 'boom', 500),
      new ApiError('http', 'slow down', 429),
      new ApiError('network', 'offline'),
      new ApiError('timeout', 'too slow'),
    ]) {
      expect(shouldRetry(0, error)).toBe(true)
      expect(shouldRetry(1, error)).toBe(true)
      expect(shouldRetry(2, error)).toBe(false)
    }
  })

  it('never retries a 4xx', () => {
    expect(shouldRetry(0, new ApiError('http', 'bad request', 400))).toBe(false)
    expect(shouldRetry(0, new ApiError('http', 'not found', 404))).toBe(false)
  })

  it('never retries an error that is not an ApiError', () => {
    expect(shouldRetry(0, new Error('bug'))).toBe(false)
  })
})

describe('retryDelay', () => {
  it('grows exponentially with jitter and is capped', () => {
    for (let i = 0; i < 50; i++) {
      const first = retryDelay(0)
      expect(first).toBeGreaterThanOrEqual(250)
      expect(first).toBeLessThanOrEqual(500)
      expect(retryDelay(10)).toBeLessThanOrEqual(4000)
    }
  })
})
