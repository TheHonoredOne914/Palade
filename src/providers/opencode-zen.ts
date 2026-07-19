import { DEFAULT_DEADLINE_MS } from './base.js'
import { OpenAICompatibleProvider, type OpenAICompatibleConfig } from './openaiCompatible.js'

const CONFIG: OpenAICompatibleConfig = {
  name: 'opencode-zen',
  label: 'OpenCode Zen',
  defaultModel: 'deepseek-v4-flash-free',
  defaultBaseUrl: 'https://opencode.ai/zen/v1',
  defaultMaxConcurrency: 8,
  // Reasoning models consume tokens for thinking, so when the caller doesn't
  // specify a budget we default generously. This never inflates an explicit
  // caller request (e.g. triage's 512-token cheap calls) — that would waste
  // tokens and slow down the request.
  defaultMaxTokens: 16384,
  // Some reasoning models put the actual answer only in reasoning_content,
  // leaving content empty — fall back to it instead of treating this as truly
  // empty output and paying for an unnecessary larger-token-budget retry.
  extractContent: (message) => message?.content || message?.reasoning_content || '',
}

// Thin subclass of the shared OpenAI-compatible adapter (providers-003) —
// OpenCode Zen only differs from the other four adapters in its default
// model/tokens and the reasoning_content fallback above; everything else
// (retry/backoff/dead-marking/error-shape) is identical.
export class OpenCodeZenProvider extends OpenAICompatibleProvider {
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
