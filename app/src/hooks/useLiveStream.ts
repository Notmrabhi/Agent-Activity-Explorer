import { useEffect, useEffectEvent, useState } from 'react'
import { API_BASE_URL } from '../api/client'
import { isEventSummary } from '../api/guards'
import type { EventSummary } from '../api/types'

export type LiveStatus = 'off' | 'connecting' | 'live' | 'reconnecting'

const MAX_BACKOFF_MS = 30_000

/**
 * Subscribes to GET /stream (Server-Sent Events) while `enabled`.
 *
 * EventSource retries dropped connections by itself, but gives up for good when the server
 * answers with an error status, which this API does at random. So when it closes we reconnect
 * ourselves with exponential backoff, and reset the backoff once a connection opens.
 */
export function useLiveStream(enabled: boolean, onEvent: (event: EventSummary) => void): LiveStatus {
  // Starts as 'connecting'; while disabled the hook reports 'off' regardless.
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const handleEvent = useEffectEvent(onEvent)

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

    connect()
    return () => {
      stopped = true
      window.clearTimeout(retryTimer)
      source?.close()
      setStatus('connecting')
    }
  }, [enabled])

  return enabled ? status : 'off'
}
