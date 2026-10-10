import { useEffect, useState } from 'react'

/** How long a request may run before we tell the user it is slow. */
export const SLOW_AFTER_MS = 2500

/**
 * True once `active` has stayed true for `delayMs`. Resets as soon as `active` turns false,
 * so each new request gets its own grace period.
 */
export function useSlowFlag(active: boolean, delayMs: number = SLOW_AFTER_MS): boolean {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setSlow(true), delayMs)
    return () => {
      window.clearTimeout(timer)
      setSlow(false)
    }
  }, [active, delayMs])

  return active && slow
}
