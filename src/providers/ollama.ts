import type { CompletionRequest, CompletionResponse, IProvider } from './base.js'
import {
  createLimiter,
  fetchWithRetry,
  shouldRetryEmptyContent,
  nextRetryMaxTokens,
} from './base.js'
import { OllamaNotRunningError, AuthError } from '../errors/types.js'

const DEFAULT_DEADLINE_MS = 300_000

export default class OllamaProvider implements IProvider {
  name = 'ollama'
  model: string
  private baseUrl: string
  private readonly deadlineMs: number
  private readonly limiter: ReturnType<typeof createLimiter>
  private dead = false

  constructor(
    model?: string,
    baseUrl?: string,
    maxConcurrency = 4,
    deadlineMs: number = DEFAULT_DEADLINE_MS
  ) {
    this.model = model ?? 'minimax-m2.5'
    this.baseUrl = baseUrl ?? 'http://localhost:11434'
    this.limiter = createLimiter(maxConcurrency)
    this.deadlineMs = deadlineMs
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
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
    const start = performance.now()

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
      stream: false,
      options: {
        temperature: req.temperature ?? 0.0,
        num_predict: maxTokens,
      },
    }

    // Combine the caller's cancellation signal with this provider's own hard
    // ceiling, matching every other adapter (groq/cerebras/nvidia/openrouter/
    // opencode-zen) — without this, a hung local Ollama server never times out.
    const timeoutSignal = AbortSignal.timeout(Math.max(deadline - Date.now(), 1))
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal

    try {
      const res = await fetchWithRetry(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })

      if (!res.ok) {
        // Attach a structured status (matching every other adapter's AuthError)
        // so callers can classify fatal auth errors without pattern-matching text.
        if (res.status === 401 || res.status === 403) {
          throw new AuthError(
            `Ollama HTTP error: ${res.status} ${res.statusText}`,
            res.status,
            this.name
          )
        }
        throw new Error(`Ollama HTTP error: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()
      const end = performance.now()
      const content = data.message?.content ?? ''
      const outputTokens = data.eval_count ?? 0

      // If content is empty but tokens were used, the model consumed its whole
      // budget thinking — retry with more tokens (cap at 32768), same pattern as
      // every other adapter (groq/cerebras/nvidia/openrouter/opencode-zen).
      if (shouldRetryEmptyContent(content, outputTokens, attempt)) {
        const newMax = nextRetryMaxTokens(maxTokens)
        if (newMax > maxTokens) return this.doComplete(req, newMax, attempt + 1, deadline)
      }

      return {
        content,
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens,
        durationMs: end - start,
        provider: this.name,
        model: this.model,
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed'))
      ) {
        throw new OllamaNotRunningError()
      }
      throw err
    }
  }

  // Shared dead state: lets multiple FallbackProvider chains wrapping this
  // same instance (e.g. router.ts's primary and synthesis chains) agree on
  // whether this provider is dead, instead of each chain keeping its own
  // separate dead-tracking Set.
  markDead(): void {
    this.dead = true
  }

  isDead(): boolean {
    return this.dead
  }

  async isAvailable(): Promise<boolean> {
    if (this.dead) return false
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(1500),
      })
      return res.ok
    } catch {
      return false
    }
  }
}
