import { DEFAULT_DEADLINE_MS } from './base.js'
import { OpenAICompatibleProvider, type OpenAICompatibleConfig } from './openaiCompatible.js'

// Exported so config/models.test.ts can assert config/models.ts's
// PROVIDER_BASE_URLS entry for this provider matches this adapter's real
// default instead of the two hand-duplicated literals silently drifting
// apart (cli-006).
export const CONFIG: OpenAICompatibleConfig = {
  name: 'groq',
  label: 'Groq',
  defaultModel: 'openai/gpt-oss-120b',
  defaultBaseUrl: 'https://api.groq.com/openai/v1',
  defaultMaxConcurrency: 8,
  defaultMaxTokens: 4096,
}

// Thin subclass of the shared OpenAI-compatible adapter (providers-003) —
// Groq's chat-completions API has no quirks beyond the shared defaults, so
// this class exists mainly to preserve the public constructor shape
// router.ts's PROVIDER_FACTORIES already depends on.
export class GroqProvider extends OpenAICompatibleProvider {
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
