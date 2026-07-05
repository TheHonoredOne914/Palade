import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { fetchWithRetry, createLimiter, isDailyLimitError } from './base.js'

const DEFAULT_DEADLINE_MS = 300_000

export class OpenRouterProvider implements IProvider {
  readonly name = 'openrouter'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly deadlineMs: number
  private readonly limiter: ReturnType<typeof createLimiter>
  private dailyLimitExhausted = false

  constructor(
    apiKey: string,
    model = 'deepseek/deepseek-r1',
    maxConcurrency = 8,
    baseUrl = 'https://openrouter.ai/api/v1',
    deadlineMs: number = DEFAULT_DEADLINE_MS
  ) {
    this.apiKey = apiKey
    this.model = model
    this.limiter = createLimiter(maxConcurrency)
    this.baseUrl = baseUrl
    this.deadlineMs = deadlineMs
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (this.dailyLimitExhausted) {
      throw new Error('OpenRouter daily limit exhausted for this session')
    }
    return this.limiter(() =>
      this.doComplete(req, req.maxTokens ?? 4096, 0, Date.now() + this.deadlineMs)
    )
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
        throw new Error('OpenRouter provider timeout — request exceeded deadline')
      }
      throw err
    }

    if (res.status === 429) {
      // fetchWithRetry already retried this request internally using the
      // server's Retry-After header — layering another manual wait-and-retry
      // loop on top just doubles the delay for no benefit. By the time we get
      // here the retry budget is spent, so classify and surface the error.
      const body = await res.text()
      if (isDailyLimitError(body)) {
        this.dailyLimitExhausted = true
        throw new Error(`OpenRouter daily limit exceeded. ${body.slice(0, 200)}`)
      }
      throw new Error(`OpenRouter rate limited — retries exhausted. ${body.slice(0, 200)}`)
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
    // Groq/Cerebras/NVIDIA/OpenCode Zen.
    if (content.trim().length === 0 && outputTokens > 0 && attempt < 2) {
      const newMax = Math.min(maxTokens * 2, 32768)
      return this.doComplete(req, newMax, attempt + 1, deadline)
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
