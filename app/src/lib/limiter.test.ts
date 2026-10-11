import { describe, expect, it } from 'vitest'
import { createLimiter } from './limiter'

function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('createLimiter', () => {
  it('runs at most `max` tasks at once, the rest in order', async () => {
    const run = createLimiter(2)
    const gates = [deferred(), deferred(), deferred()]
    const started: number[] = []
    const all = gates.map((gate, i) =>
      run(() => {
        started.push(i)
        return gate.promise
      }),
    )
    await tick()
    expect(started).toEqual([0, 1])
    gates[0]?.resolve()
    await tick()
    expect(started).toEqual([0, 1, 2])
    gates[1]?.resolve()
    gates[2]?.resolve()
    await Promise.all(all)
  })

  it('drops a waiting task whose request was cancelled, without running it', async () => {
    const run = createLimiter(1)
    const gate = deferred()
    let ranSecond = false
    const first = run(() => gate.promise)
    const controller = new AbortController()
    const second = run(async () => {
      ranSecond = true
    }, controller.signal)
    controller.abort()
    gate.resolve()
    await first
    await expect(second).rejects.toBeDefined()
    expect(ranSecond).toBe(false)
  })

  it('frees the slot when a task fails', async () => {
    const run = createLimiter(1)
    await expect(run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(run(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })
})
