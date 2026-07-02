import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withExponentialBackoff } from './backoff.js'

describe('withExponentialBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('never sleeps longer than maxDelayMs, even at the cap and with jitter', async () => {
    const delays: number[] = []
    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((cb: (...a: unknown[]) => void, ms?: number) => {
        delays.push(ms ?? 0)
        cb()
        return 0 as unknown as ReturnType<typeof setTimeout>
      })

    // Force jitter to its maximum so we exercise the worst case.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)

    const maxDelayMs = 8000
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      throw new Error('429 rate limited')
    })

    await expect(
      withExponentialBackoff(fn, {
        maxRetries: 10,
        baseDelayMs: 1000,
        maxDelayMs,
        retryableErrors: ['429'],
      })
    ).rejects.toThrow('429')

    expect(calls).toBe(11)
    expect(delays.length).toBeGreaterThan(0)
    for (const d of delays) {
      expect(d).toBeLessThanOrEqual(maxDelayMs)
    }
    setTimeoutSpy.mockRestore()
  })
})
