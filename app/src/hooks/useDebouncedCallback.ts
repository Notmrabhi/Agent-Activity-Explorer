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
    // One mutable box, private to this closure (not render state). Mutating a property instead of
    // reassigning captured `let`s keeps the React compiler lint from flagging it.
    const box: { timer: number | undefined; pending: Args | null } = {
      timer: undefined,
      pending: null,
    }

    const run = () => {
      box.timer = undefined
      const args = box.pending
      if (args) {
        box.pending = null
        callbackRef.current(...args)
      }
    }
    const fn = ((...args: Args) => {
      box.pending = args
      window.clearTimeout(box.timer)
      box.timer = window.setTimeout(run, delayMs)
    }) as Debounced<Args>
    fn.cancel = () => {
      window.clearTimeout(box.timer)
      box.timer = undefined
      box.pending = null
    }
    fn.flush = () => {
      window.clearTimeout(box.timer)
      run()
    }
    return fn
  }, [delayMs])

  useEffect(() => debounced.cancel, [debounced])
  return debounced
}
