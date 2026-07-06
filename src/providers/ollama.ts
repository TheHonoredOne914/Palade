import type { CompletionRequest, CompletionResponse, IProvider } from './base.js'
import { createLimiter } from './base.js'
import { OllamaNotRunningError, AuthError } from '../errors/types.js'

const DEFAULT_DEADLINE_MS = 180_000

export default class OllamaProvider implements IProvider {
  name = 'ollama'
  model: string
  private baseUrl: string
  private readonly limiter: ReturnType<typeof createLimiter>
  private readonly deadlineMs: number

  constructor(model?: string, baseUrl?: string, maxConcurrency = 4, deadlineMs: number = DEFAULT_DEADLINE_MS) {
    this.model = model ?? 'minimax-m2.5'
    this.baseUrl = baseUrl ?? 'http://localhost:11434'
    this.limiter = createLimiter(maxConcurrency)
    this.deadlineMs = deadlineMs
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    return this.limiter(() => this.doComplete(req, req.maxTokens ?? 4096, 0))
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    attempt: number
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

    try {
      const timeoutSignal = AbortSignal.timeout(this.deadlineMs)
      const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal

      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new AuthError(`Ollama HTTP error: ${res.status} ${res.statusText}`, res.status, this.name)
        }
        throw new Error(`Ollama HTTP error: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()
      const end = performance.now()
      const content = data.message?.content ?? ''
      const outputTokens = data.eval_count ?? 0

      // If content is empty but tokens were used, retry with more tokens (cap at 32768)
      if (content.trim().length === 0 && outputTokens > 0 && attempt < 2) {
        const newMax = Math.min(maxTokens * 2, 32768)
        if (newMax > maxTokens) return this.doComplete(req, newMax, attempt + 1)
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
