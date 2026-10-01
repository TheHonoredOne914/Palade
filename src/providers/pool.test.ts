import { describe, it, expect, vi } from 'vitest'
import { ProviderPool, PROVIDER_POOL_SOURCE, type PoolSourceTaggedError } from './pool.js'
import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { AuthError } from '../errors/types.js'

function mockProvider(
  name: string,
  opts: {
    available?: boolean
    dead?: boolean
    deadFromAuth?: boolean
    fail?: Error | string
  } = {}
): IProvider {
  const { available = true, dead = false, deadFromAuth = false, fail } = opts
  return {
    name,
    model: `${name}-model`,
    complete: vi.fn(async (): Promise<CompletionResponse> => {
      if (fail !== undefined) throw fail
      return {
        content: `response from ${name}`,
        inputTokens: 1,
        outputTokens: 1,
        durationMs: 1,
        provider: name,
        model: `${name}-model`,
      }
    }),
    isAvailable: vi.fn(async () => available),
    isDead: vi.fn(() => dead),
    isDeadFromAuth: vi.fn(() => deadFromAuth),
    markDead: vi.fn(),
  }
}

const dummyReq: CompletionRequest = { systemPrompt: 'system', userPrompt: 'user' }

describe('ProviderPool', () => {
  it('round-robins across members on sequential calls', async () => {
    const a = mockProvider('a')
    const b = mockProvider('b')
    const c = mockProvider('c')
    const pool = new ProviderPool('pool', [a, b, c])

    const r1 = await pool.complete(dummyReq)
    const r2 = await pool.complete(dummyReq)
    const r3 = await pool.complete(dummyReq)
    const r4 = await pool.complete(dummyReq)

    expect([r1.provider, r2.provider, r3.provider, r4.provider]).toEqual(['a', 'b', 'c', 'a'])
  })

  it('claims a distinct startIdx per concurrent call instead of piling onto one member', async () => {
    const a = mockProvider('a')
    const b = mockProvider('b')
    const c = mockProvider('c')
    const pool = new ProviderPool('pool', [a, b, c])

    // Fire all three concurrently (no await between calls) — each call must
    // synchronously claim its own startIdx before any `complete()` call
    // resolves, so all three members get exactly one call each rather than
    // racing onto the same stale index.
    const results = await Promise.all([
      pool.complete(dummyReq),
      pool.complete(dummyReq),
      pool.complete(dummyReq),
    ])

    expect(results.map((r) => r.provider).sort()).toEqual(['a', 'b', 'c'])
    expect(a.complete).toHaveBeenCalledTimes(1)
    expect(b.complete).toHaveBeenCalledTimes(1)
    expect(c.complete).toHaveBeenCalledTimes(1)
  })

  it('skips an unavailable member and routes to the next healthy one', async () => {
    const dead = mockProvider('dead', { available: false })
    const healthy = mockProvider('healthy', { available: true })
    const pool = new ProviderPool('pool', [dead, healthy])

    const res = await pool.complete(dummyReq)

    expect(res.provider).toBe('healthy')
    expect(dead.complete).not.toHaveBeenCalled()
  })

  it('tags a thrown Error with the specific member instance responsible', async () => {
    const boom = new Error('boom')
    const failing = mockProvider('failing', { fail: boom })
    const pool = new ProviderPool('pool', [failing])

    let caught: PoolSourceTaggedError | undefined
    try {
      await pool.complete(dummyReq)
    } catch (e) {
      caught = e as PoolSourceTaggedError
    }

    expect(caught).toBeDefined()
    expect(caught?.[PROVIDER_POOL_SOURCE]).toBe(failing)
  })

  it('wraps a non-Error throw in an Error and still tags it (providers-004)', async () => {
    const failing = mockProvider('failing', { fail: 'a raw string error' })
    const pool = new ProviderPool('pool', [failing])

    let caught: PoolSourceTaggedError | undefined
    try {
      await pool.complete(dummyReq)
    } catch (e) {
      caught = e as PoolSourceTaggedError
    }

    expect(caught).toBeInstanceOf(Error)
    expect(caught?.message).toContain('a raw string error')
    expect(caught?.[PROVIDER_POOL_SOURCE]).toBe(failing)
  })

  describe('all-dead synthesized error path', () => {
    it('synthesizes an AuthError when the last-resort pick is already dead from auth', async () => {
      const authDead = mockProvider('auth-dead', {
        available: false,
        dead: true,
        deadFromAuth: true,
      })
      const pool = new ProviderPool('pool', [authDead])

      let caught: unknown
      try {
        await pool.complete(dummyReq)
      } catch (e) {
        caught = e
      }

      expect(caught).toBeInstanceOf(AuthError)
      expect((caught as AuthError).providerName).toBe('auth-dead')
      expect((caught as PoolSourceTaggedError)[PROVIDER_POOL_SOURCE]).toBe(authDead)
      // The already-dead provider's own .complete() must never be invoked —
      // the synthesized error is thrown before that call.
      expect(authDead.complete).not.toHaveBeenCalled()
    })

    it('synthesizes a quota-tagged error when the last-resort pick is dead but not from auth', async () => {
      const quotaDead = mockProvider('quota-dead', {
        available: false,
        dead: true,
        deadFromAuth: false,
      })
      const pool = new ProviderPool('pool', [quotaDead])

      let caught: unknown
      try {
        await pool.complete(dummyReq)
      } catch (e) {
        caught = e
      }

      expect(caught).toBeInstanceOf(Error)
      expect(caught).not.toBeInstanceOf(AuthError)
      expect((caught as Error).message).toContain('quota exhausted')
      expect((caught as PoolSourceTaggedError)[PROVIDER_POOL_SOURCE]).toBe(quotaDead)
      expect(quotaDead.complete).not.toHaveBeenCalled()
    })
  })

  describe('isDead / isDeadFromAuth', () => {
    it('isDead is false while any member is alive', () => {
      const alive = mockProvider('alive', { dead: false })
      const dead = mockProvider('dead', { dead: true })
      const pool = new ProviderPool('pool', [alive, dead])
      expect(pool.isDead()).toBe(false)
    })

    it('isDead is true only once every member is dead', () => {
      const dead1 = mockProvider('dead1', { dead: true })
      const dead2 = mockProvider('dead2', { dead: true })
      const pool = new ProviderPool('pool', [dead1, dead2])
      expect(pool.isDead()).toBe(true)
    })

    it('isDeadFromAuth is true only when every dead member died from auth', () => {
      const authDead = mockProvider('a', { dead: true, deadFromAuth: true })
      const quotaDead = mockProvider('b', { dead: true, deadFromAuth: false })
      const pool = new ProviderPool('pool', [authDead, quotaDead])
      expect(pool.isDeadFromAuth()).toBe(false)

      const allAuthDead = new ProviderPool('pool2', [
        mockProvider('c', { dead: true, deadFromAuth: true }),
        mockProvider('d', { dead: true, deadFromAuth: true }),
      ])
      expect(allAuthDead.isDeadFromAuth()).toBe(true)
    })
  })

  it('markDead is a no-op (does not affect isDead)', () => {
    const alive = mockProvider('alive', { dead: false })
    const pool = new ProviderPool('pool', [alive])
    pool.markDead()
    expect(pool.isDead()).toBe(false)
  })
})
