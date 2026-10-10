import { useEffect, useMemo, useRef } from 'react'

export interface Debounced<Args extends unknown[]> {
  (...args: Args): void
  /** Drop a pending call. */
  cancel: () => void
  /** Run a pending call now. */
  flush: () => void
}

/**
 * A stable debounced wrapper around `callback`. The latest callback is always used, so callers
 * don't need to memoise it. Pending calls are cancelled on unmount.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): Debounced<Args> {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  })

  const debounced = useMemo(() => {
    let timer: number | undefined
    let pending: Args | null = null

    const run = () => {
      timer = undefined
      if (pending) {
        const args = pending
        pending = null
        callbackRef.current(...args)
      }
    }
    const fn = ((...args: Args) => {
      pending = args
      window.clearTimeout(timer)
      timer = window.setTimeout(run, delayMs)
    }) as Debounced<Args>
    fn.cancel = () => {
      window.clearTimeout(timer)
      timer = undefined
      pending = null
    }
    fn.flush = () => {
      window.clearTimeout(timer)
      run()
    }
    return fn
  }, [delayMs])

  useEffect(() => debounced.cancel, [debounced])
  return debounced
}
