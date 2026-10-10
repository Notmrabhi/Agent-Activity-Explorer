import { useEffect, useEffectEvent, useState } from 'react'
import { API_BASE_URL } from '../api/client'
import { isEventSummary } from '../api/guards'
import type { EventSummary } from '../api/types'

export type LiveStatus = 'off' | 'connecting' | 'live' | 'reconnecting'

const MAX_BACKOFF_MS = 10_000

/**
 * EventSource gives up for good on an error status, which this API sends at random, so we
 * reconnect ourselves with backoff. `onOpen` runs on every (re)connect so the caller can catch up.
 */
export function useLiveStream(
  enabled: boolean,
  onEvent: (event: EventSummary) => void,
  onOpen: () => void,
): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const handleEvent = useEffectEvent(onEvent)
  const handleOpen = useEffectEvent(onOpen)

  useEffect(() => {
    if (!enabled) return
    let source: EventSource | null = null
    let retryTimer = 0
    let backoff = 1000
    let stopped = false

    const connect = () => {
      source = new EventSource(`${API_BASE_URL}/stream`)
      source.onopen = () => {
        backoff = 1000
        setStatus('live')
        handleOpen()
      }
      source.onmessage = (message: MessageEvent<string>) => {
        let data: unknown
        try {
          data = JSON.parse(message.data)
        } catch {
          return
        }
        if (isEventSummary(data)) handleEvent(data)
      }
      source.onerror = () => {
        if (stopped || !source) return
        setStatus('reconnecting')
        if (source.readyState === EventSource.CLOSED) {
          source = null
          retryTimer = window.setTimeout(connect, backoff)
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        }
      }
    }

    // Only while waiting out a backoff (no source).
    const retryNow = () => {
      if (stopped || source || document.visibilityState !== 'visible') return
      window.clearTimeout(retryTimer)
      backoff = 1000
      connect()
    }

    connect()
    window.addEventListener('online', retryNow)
    document.addEventListener('visibilitychange', retryNow)
    return () => {
      stopped = true
      window.clearTimeout(retryTimer)
      window.removeEventListener('online', retryNow)
      document.removeEventListener('visibilitychange', retryNow)
      source?.close()
      setStatus('connecting')
    }
  }, [enabled])

  return enabled ? status : 'off'
}
