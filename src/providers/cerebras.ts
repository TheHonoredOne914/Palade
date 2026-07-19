import { DEFAULT_DEADLINE_MS } from './base.js'
import { OpenAICompatibleProvider, type OpenAICompatibleConfig } from './openaiCompatible.js'

const CONFIG: OpenAICompatibleConfig = {
  name: 'cerebras',
  label: 'Cerebras',
  defaultModel: 'gpt-oss-120b',
  defaultBaseUrl: 'https://api.cerebras.ai/v1',
  defaultMaxConcurrency: 4,
  defaultMaxTokens: 4096,
}

// Thin subclass of the shared OpenAI-compatible adapter (providers-003) —
// Cerebras's chat-completions API has no quirks beyond the shared defaults,
// so this class exists mainly to preserve the public constructor shape
// router.ts's PROVIDER_FACTORIES already depends on.
export class CerebrasProvider extends OpenAICompatibleProvider {
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
