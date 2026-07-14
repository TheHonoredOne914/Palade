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

interface OpenAIMessage {
  content?: string
  reasoning_content?: string
}

interface OpenAIChoice {
  message?: OpenAIMessage
}

interface OpenAIUsage {
  prompt_tokens?: number
  completion_tokens?: number
}

interface OpenAIResponse {
  choices?: OpenAIChoice[]
  usage?: OpenAIUsage
}

/**
 * Shared config for every OpenAI chat-completions-compatible adapter
 * (groq/cerebras/nvidia/openrouter/opencode-zen). These five adapters used to
 * each hand-copy an ~90-line doComplete() that differed only in the values
 * captured here — the retry/backoff/dead-marking/error-shape logic itself was
 * identical across all five and had started to drift (providers-003).
 */
export interface OpenAICompatibleConfig {
  /** Internal provider name — matches IProvider.name / router.ts's PROVIDER_NAMES entries. */
  name: string
  /** Human-readable label used in error/log messages (e.g. 'NVIDIA', 'OpenCode Zen'). */
  label: string
  defaultModel: string
  defaultBaseUrl: string
  defaultMaxConcurrency: number
  /** max_tokens used for a call when the caller's CompletionRequest doesn't specify one. */
  defaultMaxTokens: number
  /** Extra request headers beyond Authorization/Content-Type (openrouter's Referer/Title). */
  extraHeaders?: () => Record<string, string>
  /**
   * Extracts the completion text from one choice's message. Defaults to
   * `.content`; opencode-zen overrides this to also fall back to
   * `.reasoning_content` for reasoning models that put the answer there
   * instead, leaving `.content` empty.
   */
  extractContent?: (message: OpenAIMessage | undefined) => string
}

const defaultExtractContent = (message: OpenAIMessage | undefined): string => message?.content ?? ''

export class OpenAICompatibleProvider implements IProvider {
  readonly name: string
  readonly model: string
  private readonly label: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly deadlineMs: number
  private readonly limiter: ReturnType<typeof createLimiter>
  private readonly requestDefaultMaxTokens: number
  private readonly extraHeaders: () => Record<string, string>
  private readonly extractContent: (message: OpenAIMessage | undefined) => string
  private dailyLimitExhausted = false
  // Set by markDead() for a fatal reason OTHER than a confirmed daily-limit
  // response (e.g. an auth failure on this key) — kept distinct from
  // dailyLimitExhausted so complete()'s guard doesn't keep reporting "daily
  // limit exceeded" forever for a provider that was actually killed for an
  // unrelated reason (providers-001).
  private deadGeneric = false

  constructor(
    cfg: OpenAICompatibleConfig,
    apiKey: string,
    model?: string,
    maxConcurrency?: number,
    baseUrl?: string,
    deadlineMs: number = DEFAULT_DEADLINE_MS
  ) {
    this.name = cfg.name
    this.label = cfg.label
    this.apiKey = apiKey
    this.model = model ?? cfg.defaultModel
    this.limiter = createLimiter(maxConcurrency ?? cfg.defaultMaxConcurrency)
    this.baseUrl = baseUrl ?? cfg.defaultBaseUrl
    this.deadlineMs = deadlineMs
    this.requestDefaultMaxTokens = cfg.defaultMaxTokens
    this.extraHeaders = cfg.extraHeaders ?? (() => ({}))
    this.extractContent = cfg.extractContent ?? defaultExtractContent
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (this.dailyLimitExhausted) {
      throw new Error(`${this.label} daily limit exhausted for this session`)
    }
    if (this.deadGeneric) {
      throw new Error(`${this.label} provider marked dead for this session (see earlier fatal error)`)
    }
    // Compute the deadline (and the retry-token ceiling below) inside the
    // limiter callback, not before it, so time spent queued behind other
    // in-flight requests at this concurrency limit doesn't eat into the
    // request's own deadline budget.
    return this.limiter(() => {
      const startingMaxTokens = req.maxTokens ?? this.requestDefaultMaxTokens
      // Retry-token ceiling scaled off THIS call's own starting maxTokens
      // (4x — enough headroom for the two doublings shouldRetryEmptyContent's
      // maxAttempts allows), rather than one constant shared across every
      // adapter. A single shared 32768 cap left opencode-zen (16384 default)
      // able to double only once (16384 -> 32768, then stuck) while adapters
      // starting lower (groq/cerebras/openrouter's 4096, nvidia's 8192) still
      // got two doublings before hitting it (providers-004/providers-006).
      // Scaling per-call also means a caller that explicitly requests a large
      // maxTokens (e.g. agents/base.ts's computeMaxTokens) still gets retry
      // headroom above its own starting point, instead of being capped below
      // a fixed adapter-level default.
      const retryCeiling = startingMaxTokens * 4
      return this.doComplete(req, startingMaxTokens, 0, Date.now() + this.deadlineMs, retryCeiling)
    })
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    attempt: number,
    deadline: number,
    retryCeiling: number
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
          ...this.extraHeaders(),
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
        throw new Error(`${this.label} provider timeout — request exceeded deadline`)
      }
      throw err
    }

    if (res.status === 429) {
      // fetchWithRetry already retried this request internally using the
      // server's Retry-After header — by the time we get here the retry
      // budget is spent, so classify and surface the error.
      const body = await res.text()
      if (isDailyLimitError(body)) {
        this.dailyLimitExhausted = true
        throw tagQuotaError(new Error(`${this.label} daily limit exceeded. ${body.slice(0, 200)}`))
      }
      throw new Error(rateLimitedMessage(this.label, body))
    }

    if (!res.ok) {
      const body = await res.text()
      if (res.status === 401 || res.status === 403) {
        throw new AuthError(
          `${this.label} error ${res.status}: ${body.slice(0, 200)}`,
          res.status,
          this.name
        )
      }
      throw new Error(`${this.label} error ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = (await res.json()) as OpenAIResponse
    const durationMs = Date.now() - start

    // A 200 OK with a missing/malformed "choices" array is not a successful
    // empty completion — surface it as a distinguishable error instead of
    // silently defaulting content/tokens to ''/0, which used to make a
    // malformed body look like a legitimate empty response (providers-006).
    if (!Array.isArray(data.choices)) {
      throw new Error(
        `${this.label} error: malformed response body — missing or invalid "choices" array`
      )
    }

    const content = this.extractContent(data.choices[0]?.message)
    const outputTokens = data.usage?.completion_tokens ?? 0

    // If content is empty but tokens were used, the model consumed its whole
    // budget thinking — retry with more tokens, same pattern for every adapter.
    if (shouldRetryEmptyContent(content, outputTokens, attempt)) {
      const newMax = nextRetryMaxTokens(maxTokens, retryCeiling)
      if (newMax > maxTokens) return this.doComplete(req, newMax, attempt + 1, deadline, retryCeiling)
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
