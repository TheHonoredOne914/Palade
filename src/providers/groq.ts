import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { fetchWithRetry, createLimiter, isDailyLimitError } from './base.js'
import { AuthError } from '../errors/types.js'

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

const DEFAULT_DEADLINE_MS = 300_000

export class GroqProvider implements IProvider {
  readonly name = 'groq'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly deadlineMs: number
  private readonly limiter: ReturnType<typeof createLimiter>
  private dailyLimitExhausted = false

  constructor(
    apiKey: string,
    model = 'openai/gpt-oss-120b',
    maxConcurrency = 8,
    baseUrl = 'https://api.groq.com/openai/v1',
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
      throw new Error('Groq daily limit exhausted for this session')
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
        throw new Error('Groq provider timeout — request exceeded deadline')
      }
      throw err
    }

    if (!res.ok) {
      const body = await res.text()
      if (res.status === 429 && isDailyLimitError(body)) {
        this.dailyLimitExhausted = true
        throw new Error(`Groq daily limit exceeded. ${body.slice(0, 200)}`)
      }
      if (res.status === 401 || res.status === 403) {
        throw new AuthError(
          `Groq error ${res.status}: ${body.slice(0, 200)}`,
          res.status,
          this.name
        )
      }
      throw new Error(`Groq error ${res.status}: ${body.slice(0, 200)}`)
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
      if (newMax > maxTokens) return this.doComplete(req, newMax, attempt + 1, deadline)
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

  // Quota-only check: reflects whether we have locally observed a daily-limit
  // response, not a live connectivity/auth probe. An invalid API key or an
  // unreachable endpoint will still report available=true here.
  async isAvailable(): Promise<boolean> {
    return !this.dailyLimitExhausted
  }
}
