import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FallbackProvider } from './router.js'
import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'

function mockProvider(
  name: string,
  model: string,
  behavior: 'success' | 'fail-retryable' | 'fail-fatal' = 'success',
): IProvider {
  return {
    name,
    model,
    complete: vi.fn(async (): Promise<CompletionResponse> => {
      if (behavior === 'fail-retryable') throw new Error('503 service unavailable')
      if (behavior === 'fail-fatal') throw new Error('invalid api key')
      return { content: `response from ${name}`, inputTokens: 10, outputTokens: 5, durationMs: 100, provider: name, model }
    }),
    isAvailable: vi.fn(async () => behavior === 'success'),
  }
}

const dummyReq: CompletionRequest = {
  systemPrompt: 'system',
  userPrompt: 'user',
}

describe('FallbackProvider', () => {
  let primary: IProvider
  let fallback1: IProvider
  let fallback2: IProvider

  beforeEach(() => {
    primary = mockProvider('primary', 'model-a')
    fallback1 = mockProvider('fallback1', 'model-b')
    fallback2 = mockProvider('fallback2', 'model-c')
  })

  // --- Test 1: Primary succeeds ---
  it('returns primary response and increments totalCount when primary succeeds', async () => {
    const fp = new FallbackProvider(primary, [fallback1])

    const res = await fp.complete(dummyReq)

    expect(res.content).toBe('response from primary')
    expect(res.provider).toBe('primary')
    expect(res.model).toBe('model-a')
    expect(fp.totalCount).toBe(1)
    expect(fp.fallbackCount).toBe(0)
    expect(fallback1.complete).not.toHaveBeenCalled()
  })

  // --- Test 2: Primary fails with retryable error, fallback succeeds ---
  it('falls back when primary fails with a retryable error and increments fallbackCount', async () => {
    primary = mockProvider('primary', 'model-a', 'fail-retryable')
    const fp = new FallbackProvider(primary, [fallback1])

    const res = await fp.complete(dummyReq)

    expect(res.content).toBe('response from fallback1')
    expect(res.provider).toBe('fallback1')
    expect(res.model).toBe('model-b')
    expect(fp.fallbackCount).toBe(1)
    expect(fp.totalCount).toBe(1)
  })

  // --- Test 3: Primary fails with non-retryable error — throws immediately ---
  it('throws immediately on non-retryable error without trying fallback', async () => {
    primary = mockProvider('primary', 'model-a', 'fail-fatal')
    const fp = new FallbackProvider(primary, [fallback1])

    await expect(fp.complete(dummyReq)).rejects.toThrow('invalid api key')
    expect(fallback1.complete).not.toHaveBeenCalled()
  })

  // --- Test 4: All providers fail with retryable errors ---
  it('throws the last error when all providers fail with retryable errors', async () => {
    primary = mockProvider('primary', 'model-a', 'fail-retryable')
    fallback1 = mockProvider('fallback1', 'model-b', 'fail-retryable')
    const fp = new FallbackProvider(primary, [fallback1])

    await expect(fp.complete(dummyReq)).rejects.toThrow('503 service unavailable')
    expect(primary.complete).toHaveBeenCalled()
    expect(fallback1.complete).toHaveBeenCalled()
  })

  // --- Test 5: Fallback response is tagged with actual fallback provider/model ---
  it('tags fallback response with the fallback provider name and model, not primary', async () => {
    primary = mockProvider('primary', 'model-a', 'fail-retryable')
    fallback1 = mockProvider('backup-provider', 'backup-model')
    const fp = new FallbackProvider(primary, [fallback1])

    const res = await fp.complete(dummyReq)

    expect(res.provider).toBe('backup-provider')
    expect(res.model).toBe('backup-model')
    // Ensure it's NOT tagged with primary's values
    expect(res.provider).not.toBe('primary')
    expect(res.model).not.toBe('model-a')
  })

  // --- Test 6: name and model getters return primary's values ---
  it('name getter returns primary provider name', () => {
    const fp = new FallbackProvider(primary, [fallback1])
    expect(fp.name).toBe('primary')
  })

  it('model getter returns primary provider model', () => {
    const fp = new FallbackProvider(primary, [fallback1])
    expect(fp.model).toBe('model-a')
  })

  // --- Test 7: isAvailable delegates to primary ---
  it('isAvailable delegates to primary provider', async () => {
    const fp = new FallbackProvider(primary, [fallback1])

    const result = await fp.isAvailable()

    expect(result).toBe(true)
    expect(primary.isAvailable).toHaveBeenCalledOnce()
    expect(fallback1.isAvailable).not.toHaveBeenCalled()
  })

  it('isAvailable returns false when primary is unavailable', async () => {
    primary = mockProvider('primary', 'model-a', 'fail-fatal')
    const fp = new FallbackProvider(primary, [fallback1])

    const result = await fp.isAvailable()

    expect(result).toBe(false)
  })

  // --- Additional edge cases ---

  describe('retryable error patterns', () => {
    const retryableMessages = [
      '429 too many requests',
      'rate limit exceeded',
      'daily limit reached',
      'quota exhausted',
      '502 bad gateway',
      '503 service unavailable',
      'request timed out',
      'connection timeout',
    ]

    for (const msg of retryableMessages) {
      it(`treats "${msg}" as retryable`, async () => {
        const failingPrimary: IProvider = {
          name: 'primary',
          model: 'model-a',
          complete: vi.fn(async () => { throw new Error(msg) }),
          isAvailable: vi.fn(async () => true),
        }
        const fp = new FallbackProvider(failingPrimary, [fallback1])

        const res = await fp.complete(dummyReq)
        expect(res.provider).toBe('fallback1')
      })
    }
  })

  it('treats non-Error thrown values as Errors', async () => {
    const failingPrimary: IProvider = {
      name: 'primary',
      model: 'model-a',
      complete: vi.fn(async () => { throw '503 whoops' }),
      isAvailable: vi.fn(async () => true),
    }
    const fp = new FallbackProvider(failingPrimary, [fallback1])

    const res = await fp.complete(dummyReq)
    expect(res.provider).toBe('fallback1')
  })

  it('round-robins the starting provider across successive calls', async () => {
    const fp = new FallbackProvider(primary, [fallback1])

    // Call 1: starts at index 0 (primary)
    const res1 = await fp.complete(dummyReq)
    expect(res1.content).toBe('response from primary')

    // Call 2: starts at index 1 (fallback1), which is not primary → fallbackCount increments
    const res2 = await fp.complete(dummyReq)
    expect(res2.provider).toBe('fallback1')
    expect(fp.fallbackCount).toBe(1)
    expect(fp.totalCount).toBe(2)
  })

  it('works with multiple fallbacks and skips failing ones', async () => {
    primary = mockProvider('primary', 'model-a', 'fail-retryable')
    fallback1 = mockProvider('fallback1', 'model-b', 'fail-retryable')
    fallback2 = mockProvider('fallback2', 'model-c', 'success')
    const fp = new FallbackProvider(primary, [fallback1, fallback2])

    const res = await fp.complete(dummyReq)

    expect(res.provider).toBe('fallback2')
    expect(res.model).toBe('model-c')
    expect(fp.fallbackCount).toBe(1)
  })

  it('suppresses console.warn when falling back', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    primary = mockProvider('primary', 'model-a', 'fail-retryable')
    const fp = new FallbackProvider(primary, [fallback1])

    await fp.complete(dummyReq)

    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('primary failed')
    expect(warnSpy.mock.calls[0][0]).toContain('fallback1')
    warnSpy.mockRestore()
  })
})
