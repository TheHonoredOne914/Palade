import { DEFAULT_DEADLINE_MS } from './base.js'
import { OpenAICompatibleProvider, type OpenAICompatibleConfig } from './openaiCompatible.js'

const CONFIG: OpenAICompatibleConfig = {
  name: 'nvidia',
  label: 'NVIDIA',
  defaultModel: 'minimaxai/minimax-m3',
  defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
  defaultMaxConcurrency: 8,
  // Reasoning models burn tokens on internal thinking, so when the caller
  // doesn't specify a budget we default generously. This never overrides an
  // explicit caller request (e.g. triage's 512-token cheap calls) — see
  // OpenAICompatibleProvider.complete()'s `req.maxTokens ?? defaultMaxTokens`.
  defaultMaxTokens: 8192,
}

// Thin subclass of the shared OpenAI-compatible adapter (providers-003) —
// NVIDIA's chat-completions API has no quirks beyond the shared defaults, so
// this class exists mainly to preserve the public constructor shape
// router.ts's PROVIDER_FACTORIES already depends on.
export class NvidiaProvider extends OpenAICompatibleProvider {
  constructor(
    apiKey: string,
    model?: string,
    maxConcurrency?: number,
    baseUrl?: string,
    deadlineMs: number = DEFAULT_DEADLINE_MS
  ) {
    super(CONFIG, apiKey, model, maxConcurrency, baseUrl, deadlineMs)
  }
}
