import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { fetchModels, PROVIDER_BASE_URLS } from './models.js'
import { CONFIG as GROQ_CONFIG } from '../providers/groq.js'
import { CONFIG as CEREBRAS_CONFIG } from '../providers/cerebras.js'
import { CONFIG as NVIDIA_CONFIG } from '../providers/nvidia.js'
import { DEFAULT_BASE_URL as OPENROUTER_DEFAULT_BASE_URL } from '../providers/openrouter.js'
import { CONFIG as OPENCODE_ZEN_CONFIG } from '../providers/opencode-zen.js'

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

// PROVIDER_BASE_URLS intentionally duplicates each adapter's own default
// base URL (see models.ts's top-of-file comment on why: importing the
// adapters here would create a circular dependency). Assert the duplicates
// actually match each adapter's real default so the two can't silently drift
// apart (cli-006).
describe('PROVIDER_BASE_URLS matches each adapter default', () => {
  it('groq', () => {
    expect(PROVIDER_BASE_URLS.groq).toBe(GROQ_CONFIG.defaultBaseUrl)
  })
  it('cerebras', () => {
    expect(PROVIDER_BASE_URLS.cerebras).toBe(CEREBRAS_CONFIG.defaultBaseUrl)
  })
  it('nvidia', () => {
    expect(PROVIDER_BASE_URLS.nvidia).toBe(NVIDIA_CONFIG.defaultBaseUrl)
  })
  it('openrouter', () => {
    expect(PROVIDER_BASE_URLS.openrouter).toBe(OPENROUTER_DEFAULT_BASE_URL)
  })
  it('opencode-zen', () => {
    expect(PROVIDER_BASE_URLS['opencode-zen']).toBe(OPENCODE_ZEN_CONFIG.defaultBaseUrl)
  })
})
