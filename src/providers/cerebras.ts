import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { fetchWithRetry, createLimiter } from './base.js'

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

export class CerebrasProvider implements IProvider {
  readonly name = 'cerebras'
  readonly model: string
  private readonly apiKey: string
  private readonly limiter: ReturnType<typeof createLimiter>
  private dailyLimitExhausted = false

  constructor(apiKey: string, model = 'gpt-oss-120b', maxConcurrency = 4) {
    this.apiKey = apiKey
    this.model = model
    this.limiter = createLimiter(maxConcurrency)
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (this.dailyLimitExhausted) {
      throw new Error('Cerebras daily limit exhausted for this session')
    }
    return this.limiter(() => this.doComplete(req, req.maxTokens ?? 4096, 0))
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    attempt: number
  ): Promise<CompletionResponse> {
    const start = Date.now()
    const res = await fetchWithRetry('https://api.cerebras.ai/v1/chat/completions', {
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
      signal: req.signal,
    })

    if (!res.ok) {
      const body = await res.text()
      if (res.status === 429 && /daily|per-day/i.test(body)) {
        this.dailyLimitExhausted = true
        throw new Error(`Cerebras daily limit exceeded. ${body.slice(0, 200)}`)
      }
      throw new Error(`Cerebras error ${res.status}: ${body}`)
    }

    const data: OpenAIResponse = (await res.json()) as OpenAIResponse
    const durationMs = Date.now() - start
    const content = data.choices?.[0]?.message?.content ?? ''
    const outputTokens = data.usage?.completion_tokens ?? 0

    // If content is empty but tokens were used, the model consumed its whole
    // budget thinking — retry with more tokens (cap at 32768), same pattern as
    // NVIDIA/OpenCode Zen.
    if (content.trim().length === 0 && outputTokens > 0 && attempt < 2) {
      const newMax = Math.min(maxTokens * 2, 32768)
      return this.doComplete(req, newMax, attempt + 1)
    }

    return {
      content,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens,
      durationMs,
      provider: this.name,
      model: this.model,
    }
  }

  async isAvailable(): Promise<boolean> {
    return !this.dailyLimitExhausted
  }
}
