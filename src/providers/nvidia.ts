import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { fetchWithRetry } from './base.js'

const AVAILABILITY_CACHE_MS = 60_000

export class NvidiaProvider implements IProvider {
  readonly name = 'nvidia'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private availabilityCache: { result: boolean; timestamp: number } | null = null

  constructor(
    apiKey: string,
    model = 'minimaxai/minimax-m3',
    baseUrl = 'https://integrate.api.nvidia.com/v1'
  ) {
    this.apiKey = apiKey
    this.model = model
    this.baseUrl = baseUrl
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    // Reasoning models burn tokens on internal thinking, so when the caller
    // doesn't specify a budget we default generously. But we never override an
    // explicit caller request (e.g. triage's 512-token cheap calls).
    const maxTokens = req.maxTokens ?? 8192
    // One deadline for the whole logical call: internal empty-content retries
    // share it, so the 5-min ceiling holds across attempts instead of per attempt.
    return this.doComplete(req, maxTokens, 0, Date.now() + 300_000)
  }

  private async doComplete(
    req: CompletionRequest,
    maxTokens: number,
    attempt: number,
    deadline: number
  ): Promise<CompletionResponse> {
    const start = Date.now()
    // Combine the caller's cancellation signal with this provider's own 5-min
    // hard ceiling, so a swarm-level abort still cancels the in-flight request
    // without losing the provider timeout.
    const timeoutSignal = AbortSignal.timeout(Math.max(deadline - Date.now(), 1))
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal
    const res = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
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

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`NVIDIA error ${res.status}: ${body}`)
    }

    const data = (await res.json()) as Record<string, unknown>
    const durationMs = Date.now() - start
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
    const content = choices?.[0]?.message?.content ?? ''
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined

    // If content is empty but tokens were used, retry with more tokens (cap at 32768)
    if (content.trim().length === 0 && (usage?.completion_tokens ?? 0) > 0 && attempt < 2) {
      const newMax = Math.min(maxTokens * 2, 32768)
      return this.doComplete(req, newMax, attempt + 1, deadline)
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
    return true
  }
}
