/**
 * Runs at most `max` tasks at a time; the rest wait in order. A task whose signal is aborted while
 * it waits is dropped without running, so work for filters the user has left never starts.
 */
export function createLimiter(max: number) {
  let active = 0
  const waiting: (() => void)[] = []

  const next = () => {
    if (active >= max) return
    const start = waiting.shift()
    if (start) start()
  }

  return function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        if (signal?.aborted) {
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
          next()
          return
        }
        active++
        task()
          .then(resolve, reject)
          .finally(() => {
            active--
            next()
          })
      }
      waiting.push(start)
      next()
    })
  }
}
