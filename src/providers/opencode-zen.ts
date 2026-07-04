import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { fetchWithRetry, sleep } from './base.js'
import chalk from 'chalk'

const AVAILABILITY_CACHE_MS = 60_000

export class OpenCodeZenProvider implements IProvider {
  readonly name = 'opencode-zen'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl = 'https://opencode.ai/zen/v1'
  private availabilityCache: { result: boolean; timestamp: number } | null = null
  private dailyLimitExhausted = false
  private static readonly MAX_429_RETRIES = 3

  constructor(apiKey: string, model = 'deepseek-v4-flash-free') {
    this.apiKey = apiKey
    this.model = model
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (this.dailyLimitExhausted) {
      throw new Error('OpenCode Zen daily limit exhausted for this session')
    }

    // Reasoning models consume tokens for thinking, so when the caller doesn't
    // specify a budget we default generously. But we never inflate an explicit
    // caller request (e.g. triage's 512-token cheap calls) — that would waste
    // tokens and slow down the request.
    const maxTokens = req.maxTokens ?? 16384

    // One deadline for the whole logical call: internal 429/500/empty-content
    // retries share it, so the 3-min ceiling holds across attempts instead of
    // resetting per attempt.
    return this.doComplete(
      req,
      maxTokens,
      { rateLimit: 0, serverError: 0, emptyContent: 0 },
      Date.now() + 180_000
    )
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    // Separate counters per error class — a 5xx or empty-content retry must
    // not consume budget from the unrelated 429 retry allowance (or vice
    // versa) when both occur across the same logical call.
    attempts: { rateLimit: number; serverError: number; emptyContent: number },
    deadline: number
  ): Promise<CompletionResponse> {
    const start = Date.now()
    // Combine the caller's cancellation signal with this provider's own 3-min
    // hard ceiling so a swarm-level abort cancels the in-flight request without
    // losing the provider timeout.
    const timeoutSignal = AbortSignal.timeout(Math.max(deadline - Date.now(), 1))
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal

    const res = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
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
      signal,
    })

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}))
      const errorMsg = (body as Record<string, unknown>)?.error as
        Record<string, unknown> | undefined
      const msg = typeof errorMsg?.message === 'string' ? errorMsg.message : ''

      if (msg.includes('daily') || msg.includes('per-day')) {
        this.dailyLimitExhausted = true
        throw new Error(`OpenCode Zen daily limit exceeded. ${msg}`)
      }

      if (attempts.rateLimit >= OpenCodeZenProvider.MAX_429_RETRIES) {
        // Exhausting the retry budget means the rate limit outlasted ~3 min,
        // not that the daily quota is gone — that case is the explicit
        // 'daily'/'per-day' branch above. Keep the provider alive so later
        // calls can succeed once the window clears.
        throw new Error(`OpenCode Zen rate limited — 429 retries exhausted`)
      }

      console.warn(
        chalk.yellow(
          `  OpenCode Zen rate limited. Waiting 60s... (${attempts.rateLimit + 1}/${OpenCodeZenProvider.MAX_429_RETRIES})`
        )
      )
      await sleep(60_000, req.signal)
      return this.doComplete(
        req,
        maxTokens,
        { ...attempts, rateLimit: attempts.rateLimit + 1 },
        deadline
      )
    }

    if (res.status >= 500 && attempts.serverError < 2) {
      console.warn(chalk.yellow(`  OpenCode Zen ${res.status} — retrying in 5s...`))
      await sleep(5_000, req.signal)
      return this.doComplete(
        req,
        maxTokens,
        { ...attempts, serverError: attempts.serverError + 1 },
        deadline
      )
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`OpenCode Zen error ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = (await res.json()) as Record<string, unknown>
    const durationMs = Date.now() - start
    const choices = data.choices as
      Array<{ message?: { content?: string; reasoning_content?: string } }> | undefined
    const content = choices?.[0]?.message?.content ?? ''
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined

    // If content is empty but tokens were used, reasoning model consumed all tokens
    // Retry with double the tokens (cap at 32768 to avoid runaway — the cap must
    // exceed the 16384 default or the retry re-sends an identical request)
    if (
      content.trim().length === 0 &&
      (usage?.completion_tokens ?? 0) > 0 &&
      attempts.emptyContent < 2
    ) {
      const newMax = Math.min(maxTokens * 2, 32768)

      return this.doComplete(
        req,
        newMax,
        { ...attempts, emptyContent: attempts.emptyContent + 1 },
        deadline
      )
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
    return true
  }
}
