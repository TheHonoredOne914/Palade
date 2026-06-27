import type { CompletionRequest, CompletionResponse, IProvider } from './base.js'
import { OllamaNotRunningError } from '../errors/types.js'

export default class OllamaProvider implements IProvider {
  name = 'ollama'
  model: string
  private baseUrl: string

  constructor(model?: string, baseUrl?: string) {
    this.model = model ?? 'codellama:13b'
    this.baseUrl = baseUrl ?? 'http://localhost:11434'
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
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
      },
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: req.signal,
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
    return true
  }
}
