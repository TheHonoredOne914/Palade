import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { fetchWithRetry } from './base.js'

export class OpenRouterProvider implements IProvider {
  readonly name = 'openrouter'
  readonly model: string
  private readonly apiKey: string
  private dailyLimitExhausted = false

  constructor(apiKey: string, model = 'nvidia/nemotron-3-super-120b-a12b:free') {
    this.apiKey = apiKey
    this.model = model
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (this.dailyLimitExhausted) {
      throw new Error('OpenRouter daily limit exhausted for this session')
    }

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
        max_tokens: req.maxTokens ?? 4096,
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
    if (this.dailyLimitExhausted) return false
    return true
  }
}
