import type {
  IProvider,
  CompletionRequest,
  CompletionResponse,
} from './base.js'
import chalk from 'chalk'

const AVAILABILITY_CACHE_MS = 60_000

export class OpenCodeZenProvider implements IProvider {
  readonly name = 'opencode-zen'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl = 'https://opencode.ai/zen/v1'
  private availabilityCache: { result: boolean; timestamp: number } | null = null
  private dailyLimitExhausted = false

  constructor(apiKey: string, model = 'deepseek-v4-flash-free') {
    this.apiKey = apiKey
    this.model = model
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (this.dailyLimitExhausted) {
      throw new Error('OpenCode Zen daily limit exhausted for this session')
    }

    // Reasoning models consume tokens for thinking — give them room
    const requestedTokens = req.maxTokens ?? 4096
    const maxTokens = Math.max(requestedTokens, 16384)

    return this.doComplete(req, maxTokens, 0)
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    attempt: number
  ): Promise<CompletionResponse> {
    const start = Date.now()

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
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
      signal: AbortSignal.timeout(180_000),
    })

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}))
      const errorMsg = (body as Record<string, unknown>)?.error as Record<string, unknown> | undefined
      const msg = typeof errorMsg?.message === 'string' ? errorMsg.message : ''

      if (msg.includes('daily') || msg.includes('per-day')) {
        this.dailyLimitExhausted = true
        throw new Error(`OpenCode Zen daily limit exceeded. ${msg}`)
      }

      console.warn(chalk.yellow('  OpenCode Zen rate limited. Waiting 60s...'))
      await new Promise(r => setTimeout(r, 60_000))
      return this.doComplete(req, maxTokens, attempt)
    }

    if (res.status >= 500 && attempt < 2) {
      console.warn(chalk.yellow(`  OpenCode Zen ${res.status} — retrying in 5s...`))
      await new Promise(r => setTimeout(r, 5_000))
      return this.doComplete(req, maxTokens, attempt + 1)
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`OpenCode Zen error ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json() as Record<string, unknown>
    const durationMs = Date.now() - start
    const choices = data.choices as Array<{ message?: { content?: string; reasoning_content?: string } }> | undefined
    const content = choices?.[0]?.message?.content ?? ''
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined

    // If content is empty but tokens were used, reasoning model consumed all tokens
    // Retry with double the tokens
    if (content.trim().length === 0 && (usage?.completion_tokens ?? 0) > 0 && attempt < 2) {
      console.warn(chalk.yellow(`  OpenCode Zen returned empty content (${usage?.completion_tokens} tokens used) — retrying with ${maxTokens * 2} tokens`))
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
    if (this.dailyLimitExhausted) return false

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
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5,
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
