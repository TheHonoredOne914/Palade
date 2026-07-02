import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenCodeZenProvider } from './opencode-zen.js'
import type { CompletionRequest } from './base.js'

const req: CompletionRequest = {
  systemPrompt: 'system',
  userPrompt: 'user',
}

function res(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('OpenCodeZenProvider transient 429 handling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Skip the real 60s waits between 429 retries.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      (cb: (...a: unknown[]) => void) => {
        cb()
        return 0 as unknown as ReturnType<typeof setTimeout>
      }
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not permanently disable the provider after a transient 429 exhausts retries', async () => {
    // A plain (non-daily) 429 on every attempt -> retries exhausted -> throw.
    const transient429 = res(429, { error: { message: 'rate limited, slow down' } })
    const fetchMock = vi.fn(async () => transient429)
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenCodeZenProvider('key')

    await expect(provider.complete(req)).rejects.toThrow('429 retries exhausted')

    // The provider must remain available for a later attempt — a transient
    // rate-limit is not a daily cap and must not poison the process.
    expect(await provider.isAvailable()).toBe(true)

    // And a subsequent successful call must go through rather than short-circuit.
    fetchMock.mockResolvedValueOnce(
      res(200, {
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })
    )
    const out = await provider.complete(req)
    expect(out.content).toBe('hello')
  })

  it('permanently disables the provider on a genuine daily-limit 429', async () => {
    const daily429 = res(429, { error: { message: 'daily limit exceeded' } })
    vi.stubGlobal('fetch', vi.fn(async () => daily429))

    const provider = new OpenCodeZenProvider('key')

    await expect(provider.complete(req)).rejects.toThrow('daily limit')
    expect(await provider.isAvailable()).toBe(false)
    await expect(provider.complete(req)).rejects.toThrow('daily limit exhausted')
  })
})
