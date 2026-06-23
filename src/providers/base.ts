import pLimit, { type LimitFunction } from 'p-limit'

export interface CompletionRequest {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
}

export interface CompletionResponse {
  content: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  provider: string
  model: string
}

export interface IProvider {
  name: string
  model: string
  complete(req: CompletionRequest): Promise<CompletionResponse>
  isAvailable(): Promise<boolean>
}

const MAX_RETRIES = 3
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 8000

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.status === 429 && attempt < retries) {
        const retryAfter = res.headers.get('retry-after')
        const parsed = retryAfter ? parseInt(retryAfter, 10) * 1000 : NaN
        const delayMs = isNaN(parsed)
          ? Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
          : Math.min(parsed, MAX_DELAY_MS)
        await sleep(delayMs)
        continue
      }
      return res
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        await sleep(Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS))
      }
    }
  }
  throw lastError ?? new Error('fetch failed')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createLimiter(maxConcurrency: number): LimitFunction {
  return pLimit(maxConcurrency)
}
