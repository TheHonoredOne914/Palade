import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { fetchWithRetry, createLimiter } from './base.js'

export class OpenRouterProvider implements IProvider {
  readonly name = 'openrouter'
  readonly model: string
  private readonly apiKey: string
  private readonly limiter: ReturnType<typeof createLimiter>
  private dailyLimitExhausted = false

  constructor(
    apiKey: string,
    model = 'nvidia/nemotron-3-super-120b-a12b:free',
    maxConcurrency = 4
  ) {
    this.apiKey = apiKey
    this.model = model
    this.limiter = createLimiter(maxConcurrency)
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (this.dailyLimitExhausted) {
      throw new Error('OpenRouter daily limit exhausted for this session')
    }
    return this.limiter(() => this.doComplete(req, req.maxTokens ?? 4096, 0))
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    attempt: number
  ): Promise<CompletionResponse> {
    const start = Date.now()

    const res = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/palade/palade',
        'X-Title': 'Palade',
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

    if (res.status === 429) {
      // fetchWithRetry already retried this request internally using the
      // server's Retry-After header — layering another manual wait-and-retry
      // loop on top just doubles the delay for no benefit. By the time we get
      // here the retry budget is spent, so classify and surface the error.
      const body = await res.json().catch(() => ({}))
      const errorMsg = (body as Record<string, unknown>)?.error as
        Record<string, unknown> | undefined
      const msg = typeof errorMsg?.message === 'string' ? errorMsg.message : ''

      if (msg.includes('per-day') || msg.includes('daily')) {
        this.dailyLimitExhausted = true
        throw new Error(`OpenRouter daily limit exceeded. ${msg}`)
      }

      throw new Error(`OpenRouter rate limited — retries exhausted. ${msg.slice(0, 200)}`)
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`OpenRouter error ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = (await res.json()) as Record<string, unknown>
    const durationMs = Date.now() - start
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
    const content = choices?.[0]?.message?.content ?? ''
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
    const outputTokens = usage?.completion_tokens ?? 0

    // If content is empty but tokens were used, the model consumed its whole
    // budget thinking — retry with more tokens (cap at 32768), same pattern as
    // NVIDIA/OpenCode Zen/Groq/Cerebras.
    if (content.trim().length === 0 && outputTokens > 0 && attempt < 2) {
      const newMax = Math.min(maxTokens * 2, 32768)
      return this.doComplete(req, newMax, attempt + 1)
    }

    return {
      content,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens,
      durationMs,
      provider: this.name,
      model: this.model,
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.dailyLimitExhausted) return false
    return true
  }
}
