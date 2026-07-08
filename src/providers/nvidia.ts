import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import {
  fetchWithRetry,
  createLimiter,
  isDailyLimitError,
  shouldRetryEmptyContent,
  nextRetryMaxTokens,
  DEFAULT_DEADLINE_MS,
} from './base.js'
import { AuthError } from '../errors/types.js'

export class NvidiaProvider implements IProvider {
  readonly name = 'nvidia'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly deadlineMs: number
  private readonly limiter: ReturnType<typeof createLimiter>
  private dailyLimitExhausted = false

  constructor(
    apiKey: string,
    model = 'minimaxai/minimax-m3',
    maxConcurrency = 8,
    baseUrl = 'https://integrate.api.nvidia.com/v1',
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
      throw new Error('NVIDIA daily limit exhausted for this session')
    }
    // Reasoning models burn tokens on internal thinking, so when the caller
    // doesn't specify a budget we default generously. But we never override an
    // explicit caller request (e.g. triage's 512-token cheap calls).
    const maxTokens = req.maxTokens ?? 8192
    // One deadline for the whole logical call: internal empty-content retries
    // share it, so the ceiling holds across attempts instead of per attempt.
    const deadline = Date.now() + this.deadlineMs
    return this.limiter(() => this.doComplete(req, maxTokens, 0, deadline))
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    attempt: number,
    deadline: number
  ): Promise<CompletionResponse> {
    const start = Date.now()
    // Combine the caller's cancellation signal with this provider's own hard
    // ceiling, so a swarm-level abort still cancels the in-flight request
    // without losing the provider timeout.
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
        throw new Error('NVIDIA provider timeout — request exceeded deadline')
      }
      throw err
    }

    if (!res.ok) {
      const body = await res.text()
      if (res.status === 429 && isDailyLimitError(body)) {
        this.dailyLimitExhausted = true
        throw new Error(`NVIDIA daily limit exceeded. ${body.slice(0, 200)}`)
      }
      if (res.status === 401 || res.status === 403) {
        throw new AuthError(
          `NVIDIA error ${res.status}: ${body.slice(0, 200)}`,
          res.status,
          this.name
        )
      }
      throw new Error(`NVIDIA error ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = (await res.json()) as Record<string, unknown>
    const durationMs = Date.now() - start
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
    const content = choices?.[0]?.message?.content ?? ''
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
    const outputTokens = usage?.completion_tokens ?? 0

    // If content is empty but tokens were used, retry with more tokens (cap at 32768)
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
  // keeping its own separate dead-tracking Set.
  markDead(): void {
    this.dailyLimitExhausted = true
  }

  isDead(): boolean {
    return this.dailyLimitExhausted
  }

  // Quota-only check: reflects whether we have locally observed a daily-limit
  // response, not a live connectivity/auth probe. An invalid API key or an
  // unreachable endpoint will still report available=true here.
  async isAvailable(): Promise<boolean> {
    return !this.dailyLimitExhausted
  }
}
