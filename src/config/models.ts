import type { ProviderId } from './apiKey.js'

// OpenAI-compatible /models endpoint for every cloud provider except ollama.
// These URLs intentionally duplicate the defaults in each provider adapter
// (groq.ts, cerebras.ts, etc.). Importing from those adapters here would
// create a circular dependency (config → providers → config), so we keep a
// separate copy.
export const PROVIDER_BASE_URLS: Record<Exclude<ProviderId, 'ollama'>, string> = {
  groq: 'https://api.groq.com/openai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  'opencode-zen': 'https://opencode.ai/zen/v1',
}

interface OpenAIModelList {
  data?: Array<{ id: string }>
}

interface OllamaTagList {
  models?: Array<{ name: string }>
}

/**
 * Fetches the live model list for a provider so the settings panel can offer
 * a real selector instead of a hardcoded guess. Returns [] on any failure
 * (bad key, network, unexpected shape) — the caller falls back to manual
 * text entry rather than surfacing this as an error.
 */
export async function fetchModels(
  providerId: ProviderId | 'ollama',
  apiKey: string,
  baseUrl?: string
): Promise<string[]> {
  try {
    if (providerId === 'ollama') {
      const base = baseUrl ?? 'http://localhost:11434'
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const json = (await res.json()) as OllamaTagList
      return (json.models ?? []).map((m) => m.name).sort()
    }

    const base = baseUrl ?? PROVIDER_BASE_URLS[providerId]
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const json = (await res.json()) as OpenAIModelList
    return (json.data ?? []).map((m) => m.id).sort()
  } catch {
    return []
  }
}
