import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import {
  fetchWithRetry,
  createLimiter,
  isDailyLimitError,
  shouldRetryEmptyContent,
  nextRetryMaxTokens,
  DEFAULT_DEADLINE_MS,
  tagQuotaError,
  rateLimitedMessage,
} from './base.js'
import { AuthError } from '../errors/types.js'

export class OpenCodeZenProvider implements IProvider {
  readonly name = 'opencode-zen'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly deadlineMs: number
  private readonly limiter: ReturnType<typeof createLimiter>
  private dailyLimitExhausted = false
  // Set by markDead() for a fatal reason OTHER than a confirmed daily-limit
  // response (e.g. an auth failure on this key) — kept distinct from
  // dailyLimitExhausted so complete()'s guard doesn't keep reporting "daily
  // limit exceeded" forever for a provider that was actually killed for an
  // unrelated reason (providers-001).
  private deadGeneric = false

  constructor(
    apiKey: string,
    model = 'deepseek-v4-flash-free',
    maxConcurrency = 8,
    baseUrl = 'https://opencode.ai/zen/v1',
    deadlineMs: number = DEFAULT_DEADLINE_MS
  ) {
    this.apiKey = apiKey
    this.model = model
    this.baseUrl = baseUrl
    this.deadlineMs = deadlineMs
    this.limiter = createLimiter(maxConcurrency)
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (this.dailyLimitExhausted) {
      throw new Error('OpenCode Zen daily limit exhausted for this session')
    }
    if (this.deadGeneric) {
      throw new Error(
        'OpenCode Zen provider marked dead for this session (see earlier fatal error)'
      )
    }

    // Reasoning models consume tokens for thinking, so when the caller doesn't
    // specify a budget we default generously. But we never inflate an explicit
    // caller request (e.g. triage's 512-token cheap calls) — that would waste
    // tokens and slow down the request.
    const maxTokens = req.maxTokens ?? 16384

    // One deadline for the whole logical call: internal empty-content retries
    // share it, so the ceiling holds across attempts instead of resetting per
    // attempt. The adapter-local 5xx retry loop that used to live here was
    // removed — the shared fetchWithRetry() below already retries 5xx/network
    // errors with backoff, so this only needs to handle the empty-content case.
    return this.limiter(() => this.doComplete(req, maxTokens, 0, Date.now() + this.deadlineMs))
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    attempt: number,
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
      const body = await res.text()
      if (isDailyLimitError(body)) {
        this.dailyLimitExhausted = true
        throw tagQuotaError(new Error(`OpenCode Zen daily limit exceeded. ${body.slice(0, 200)}`))
      }

      // fetchWithRetry already retried this request internally using the
      // server's Retry-After header — layering another manual wait-and-retry
      // loop on top just doubles the delay. Surface a retryable error and let
      // the router's fallback chain / backoff handle anything further.
      throw new Error(rateLimitedMessage('OpenCode Zen', body))
    }

    if (!res.ok) {
      const body = await res.text()
      if (res.status === 401 || res.status === 403) {
        throw new AuthError(
          `OpenCode Zen error ${res.status}: ${body.slice(0, 200)}`,
          res.status,
          this.name
        )
      }
      throw new Error(`OpenCode Zen error ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = (await res.json()) as Record<string, unknown>
    const durationMs = Date.now() - start
    const choices = data.choices as
      Array<{ message?: { content?: string; reasoning_content?: string } }> | undefined
    // Some reasoning models put the actual answer only in reasoning_content,
    // leaving content empty — fall back to it instead of treating this as
    // truly empty output and paying for an unnecessary larger-token-budget
    // retry below.
    const content = choices?.[0]?.message?.content || choices?.[0]?.message?.reasoning_content || ''
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
    const outputTokens = usage?.completion_tokens ?? 0

    // If content is empty but tokens were used, reasoning model consumed all tokens
    // Retry with double the tokens (cap at 32768 to avoid runaway — the cap must
    // exceed the 16384 default or the retry re-sends an identical request)
    if (shouldRetryEmptyContent(content, usage?.completion_tokens ?? 0, attempt)) {
      const newMax = nextRetryMaxTokens(maxTokens)
      if (newMax > maxTokens) return this.doComplete(req, newMax, attempt + 1, deadline)
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

  // Shared dead/exhausted state: lets multiple FallbackProvider chains
  // wrapping this same instance (e.g. router.ts's primary and synthesis
  // chains) agree on whether this provider is dead, instead of each chain
  // keeping its own separate dead-tracking Set. Called by router.ts for BOTH
  // a confirmed quota exhaustion AND an unrelated fatal error (e.g. an auth
  // failure) — only set dailyLimitExhausted for the former (which this
  // instance itself already does directly, above, when it observes a real
  // daily-limit response); a generic dead flag covers the rest so complete()
  // reports the right reason instead of always claiming "daily limit"
  // (providers-001).
  markDead(): void {
    this.deadGeneric = true
  }

  isDead(): boolean {
    return this.dailyLimitExhausted || this.deadGeneric
  }

  isDeadFromAuth(): boolean {
    return this.deadGeneric
  }

  // Reflects locally observed exhaustion/dead-marking, not a live
  // connectivity/auth probe — an invalid API key that hasn't yet been tried
  // (so markDead() was never called) still reports available=true here.
  async isAvailable(): Promise<boolean> {
    return !this.dailyLimitExhausted && !this.deadGeneric
  }
}
