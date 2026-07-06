import type { CompletionRequest, CompletionResponse, IProvider } from './base.js'
import { createLimiter, fetchWithRetry } from './base.js'
import { OllamaNotRunningError } from '../errors/types.js'

const DEFAULT_DEADLINE_MS = 300_000

export default class OllamaProvider implements IProvider {
  name = 'ollama'
  model: string
  private baseUrl: string
  private readonly deadlineMs: number
  private readonly limiter: ReturnType<typeof createLimiter>

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
    return this.limiter(() => this.doComplete(req))
  }

  private async doComplete(req: CompletionRequest): Promise<CompletionResponse> {
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
        num_predict: req.maxTokens ?? 4096,
      },
    }

    // Combine the caller's cancellation signal with this provider's own hard
    // ceiling, matching every other adapter (groq/cerebras/nvidia/openrouter/
    // opencode-zen) — without this, a hung local Ollama server never times out.
    const timeoutSignal = AbortSignal.timeout(this.deadlineMs)
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal

    try {
      const res = await fetchWithRetry(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })

      if (!res.ok) {
        throw new Error(`Ollama HTTP error: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()
      const end = performance.now()

      return {
        content: data.message?.content ?? '',
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
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

  async isAvailable(): Promise<boolean> {
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
