import chalk from 'chalk'
import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { fetchWithRetry, createLimiter } from './base.js'

const AVAILABILITY_CACHE_MS = 60_000

interface OpenAIChoice {
  message: { content: string }
}

interface OpenAIUsage {
  prompt_tokens: number
  completion_tokens: number
}

interface OpenAIResponse {
  choices?: OpenAIChoice[]
  usage?: OpenAIUsage
}

export class GroqProvider implements IProvider {
  readonly name = 'groq'
  readonly model: string
  private readonly apiKey: string
  private readonly limiter: ReturnType<typeof createLimiter>
  private availabilityCache: { result: boolean; timestamp: number } | null = null

  constructor(apiKey: string, model = 'llama-3.3-70b-versatile', maxConcurrency = 8) {
    this.apiKey = apiKey
    this.model = model
    this.limiter = createLimiter(maxConcurrency)
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    return this.limiter(async () => {
      const start = Date.now()
      const res = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
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
        signal: req.signal,
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Groq error ${res.status}: ${body}`)
      }

      const data: OpenAIResponse = (await res.json()) as OpenAIResponse
      const durationMs = Date.now() - start

      return {
        content: data.choices?.[0]?.message?.content ?? '',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        durationMs,
        provider: this.name,
        model: this.model,
      }
    })
  }

  async isAvailable(): Promise<boolean> {
    return true
  }
}
