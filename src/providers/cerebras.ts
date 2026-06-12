import type {
  IProvider,
  CompletionRequest,
  CompletionResponse,
} from './base.js'
import { fetchWithRetry } from './base.js'

const AVAILABILITY_CACHE_MS = 60_000

interface OpenAIChoice {
  message: { content: string }
}

interface OpenAIUsage {
  prompt_tokens: number
  completion_tokens: number
}

interface OpenAIResponse {
  choices: OpenAIChoice[]
  usage: OpenAIUsage
}

export class CerebrasProvider implements IProvider {
  readonly name = 'cerebras'
  readonly model: string
  private readonly apiKey: string
  private availabilityCache: { result: boolean; timestamp: number } | null = null

  constructor(apiKey: string, model = 'gpt-oss-120b') {
    this.apiKey = apiKey
    this.model = model
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now()
    const res = await fetchWithRetry(
      'https://api.cerebras.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ],
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature ?? 0.1,
        }),
      }
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Cerebras error ${res.status}: ${body}`)
    }

    const data: OpenAIResponse = await res.json() as OpenAIResponse
    const durationMs = Date.now() - start

    return {
      content: data.choices[0].message.content,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      durationMs,
      provider: this.name,
      model: this.model,
    }
  }

  async isAvailable(): Promise<boolean> {
    if (
      this.availabilityCache &&
      Date.now() - this.availabilityCache.timestamp < AVAILABILITY_CACHE_MS
    ) {
      return this.availabilityCache.result
    }

    try {
      const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      })
      const result = res.ok
      this.availabilityCache = { result, timestamp: Date.now() }
      return result
    } catch {
      this.availabilityCache = { result: false, timestamp: Date.now() }
      return false
    }
  }
}
