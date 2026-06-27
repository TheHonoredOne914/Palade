import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { fetchWithRetry } from './base.js'
import chalk from 'chalk'

const AVAILABILITY_CACHE_MS = 60_000

export class OpenRouterProvider implements IProvider {
  readonly name = 'openrouter'
  readonly model: string
  private readonly apiKey: string
  private availabilityCache: { result: boolean; timestamp: number } | null = null
  private dailyLimitExhausted = false

  constructor(apiKey: string, model = 'nvidia/nemotron-3-super-120b-a12b:free') {
    this.apiKey = apiKey
    this.model = model
  }

  private static readonly MAX_RETRIES = 3

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    return this.doComplete(req, 0)
  }

  private async doComplete(req: CompletionRequest, attempt: number): Promise<CompletionResponse> {
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
      const resetHeader = res.headers.get('x-ratelimit-reset')
      const body = await res.json().catch(() => ({}))
      const errorMsg = (body as Record<string, unknown>)?.error as
        Record<string, unknown> | undefined
      const msg = typeof errorMsg?.message === 'string' ? errorMsg.message : ''

      if (msg.includes('per-day')) {
        this.dailyLimitExhausted = true
        throw new Error(`OpenRouter daily limit exceeded. ${msg}`)
      }

      if (resetHeader) {
        // x-ratelimit-reset is a Unix epoch in seconds — convert to ms
        const resetEpochSec = parseInt(resetHeader, 10)
        const resetMs = isNaN(resetEpochSec) ? 0 : resetEpochSec * 1000
        const waitMs = Math.max(resetMs - Date.now(), 1000)

        if (waitMs > 60_000) {
          this.dailyLimitExhausted = true
          throw new Error(`OpenRouter rate limit — reset in ${Math.ceil(waitMs / 3600_000)}h`)
        }

        console.warn(
          chalk.yellow(`  OpenRouter rate limited. Waiting ${Math.ceil(waitMs / 1000)}s...`)
        )
        await new Promise((r) => setTimeout(r, waitMs + 500))

        // Retry once
        const retryRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

        if (!retryRes.ok) {
          const retryBody = await retryRes.text()
          throw new Error(`OpenRouter error ${retryRes.status}: ${retryBody.slice(0, 200)}`)
        }

        const retryData = (await retryRes.json()) as Record<string, unknown>
        const retryChoices = retryData.choices as
          Array<{ message?: { content?: string } }> | undefined
        const retryContent = retryChoices?.[0]?.message?.content ?? ''
        const retryUsage = retryData.usage as
          { prompt_tokens?: number; completion_tokens?: number } | undefined

        return {
          content: retryContent,
          inputTokens: retryUsage?.prompt_tokens ?? 0,
          outputTokens: retryUsage?.completion_tokens ?? 0,
          durationMs: Date.now() - start,
          provider: this.name,
          model: this.model,
        }
      }

      // No reset header — fixed 60s wait with bounded retries
      if (attempt >= OpenRouterProvider.MAX_RETRIES) {
        throw new Error('OpenRouter rate limited — retries exhausted')
      }
      console.warn(
        chalk.yellow(
          `  OpenRouter rate limited. Waiting 60s... (attempt ${attempt + 1}/${OpenRouterProvider.MAX_RETRIES})`
        )
      )
      await new Promise((r) => setTimeout(r, 60_000))
      return this.doComplete(req, attempt + 1)
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
