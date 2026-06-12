import type {
  IProvider,
  CompletionRequest,
  CompletionResponse,
} from './base.js'
import { fetchWithRetry } from './base.js'

const AVAILABILITY_CACHE_MS = 60_000

export class NvidiaProvider implements IProvider {
  readonly name = 'nvidia'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private availabilityCache: { result: boolean; timestamp: number } | null = null

  constructor(apiKey: string, model = 'minimaxai/minimax-m3', baseUrl = 'https://integrate.api.nvidia.com/v1') {
    this.apiKey = apiKey
    this.model = model
    this.baseUrl = baseUrl
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const maxTokens = Math.max(req.maxTokens ?? 4096, 16384)
    return this.doComplete(req, maxTokens, 0)
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    attempt: number
  ): Promise<CompletionResponse> {
    const start = Date.now()
    const res = await fetchWithRetry(
      `${this.baseUrl}/chat/completions`,
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
          max_tokens: maxTokens,
          temperature: req.temperature ?? 0.1,
        }),
        signal: AbortSignal.timeout(300_000),
      }
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`NVIDIA error ${res.status}: ${body}`)
    }

    const data = await res.json() as Record<string, unknown>
    const durationMs = Date.now() - start
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
    const content = choices?.[0]?.message?.content ?? ''
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined

    // If content is empty but tokens were used, retry with more tokens
    if (content.trim().length === 0 && (usage?.completion_tokens ?? 0) > 0 && attempt < 2) {
      return this.doComplete(req, maxTokens * 2, attempt + 1)
    }

    return {
      content,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
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
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
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
