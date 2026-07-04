import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { fetchWithRetry, sleep } from './base.js'
import chalk from 'chalk'

const DEFAULT_DEADLINE_MS = 180_000

export class OpenCodeZenProvider implements IProvider {
  readonly name = 'opencode-zen'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl = 'https://opencode.ai/zen/v1'
  private readonly deadlineMs: number
  private dailyLimitExhausted = false

  constructor(
    apiKey: string,
    model = 'deepseek-v4-flash-free',
    deadlineMs: number = DEFAULT_DEADLINE_MS
  ) {
    this.apiKey = apiKey
    this.model = model
    this.deadlineMs = deadlineMs
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

    // One deadline for the whole logical call: internal 500/empty-content
    // retries share it, so the ceiling holds across attempts instead of
    // resetting per attempt.
    return this.doComplete(req, maxTokens, { serverError: 0, emptyContent: 0 }, Date.now() + this.deadlineMs)
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    // Separate counters per error class — a 5xx or empty-content retry must
    // not consume budget from the unrelated allowance (or vice versa) when
    // both occur across the same logical call.
    attempts: { serverError: number; emptyContent: number },
    deadline: number
  ): Promise<CompletionResponse> {
    const start = Date.now()
    // Combine the caller's cancellation signal with this provider's own hard
    // ceiling so a swarm-level abort cancels the in-flight request without
    // losing the provider timeout.
    const timeoutSignal = AbortSignal.timeout(Math.max(deadline - Date.now(), 1))
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal

    let res: Response
    try {
      res = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
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
    } catch (err) {
      // Our own deadline firing surfaces as a generic AbortError with no
      // 'timeout' text, which router.ts's keyword classification can't
      // recognize as retryable — rethrow with a matching keyword, but only
      // when the deadline (not the caller's own signal) is what fired.
      if (
        err instanceof Error &&
        err.name === 'AbortError' &&
        timeoutSignal.aborted &&
        !req.signal?.aborted
      ) {
        throw new Error('OpenCode Zen provider timeout — request exceeded deadline')
      }
      throw err
    }

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}))
      const errorMsg = (body as Record<string, unknown>)?.error as
        Record<string, unknown> | undefined
      const msg = typeof errorMsg?.message === 'string' ? errorMsg.message : ''

      if (msg.includes('daily') || msg.includes('per-day')) {
        this.dailyLimitExhausted = true
        throw new Error(`OpenCode Zen daily limit exceeded. ${msg}`)
      }

      // fetchWithRetry already retried this request internally using the
      // server's Retry-After header — layering another manual wait-and-retry
      // loop on top just doubles the delay. Surface a retryable error and let
      // the router's fallback chain / backoff handle anything further.
      throw new Error(`OpenCode Zen rate limited — retries exhausted. ${msg.slice(0, 200)}`)
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
