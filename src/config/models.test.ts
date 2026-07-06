import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { fetchModels } from './models.js'

const mockFetch = (impl: (url: string) => Promise<Partial<Response>>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => impl(url) as Promise<Response>)
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchModels', () => {
  it('parses OpenAI-compatible data[].id', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'b-model' }, { id: 'a-model' }] }),
    }))

    const models = await fetchModels('groq', 'key')
    expect(models).toEqual(['a-model', 'b-model'])
  })

  it('parses ollama models[].name from /api/tags', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ models: [{ name: 'z-model' }, { name: 'a-model' }] }),
    }))

    const models = await fetchModels('ollama', '')
    expect(models).toEqual(['a-model', 'z-model'])
  })

  it('returns [] on non-ok response', async () => {
    mockFetch(async () => ({ ok: false }))
    const models = await fetchModels('groq', 'bad-key')
    expect(models).toEqual([])
  })

  it('returns [] when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down')))
    )
    const models = await fetchModels('groq', 'key')
    expect(models).toEqual([])
  })

  it('returns [] on empty data', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({}) }))
    const models = await fetchModels('groq', 'key')
    expect(models).toEqual([])
  })
})
