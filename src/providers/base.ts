import pLimit, { type LimitFunction } from 'p-limit'

export interface CompletionRequest {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  /**
   * Optional abort signal. When aborted, the in-flight provider request is
   * cancelled (the underlying fetch uses this signal) instead of continuing
   * to consume provider quota after the caller has given up on the result.
   */
  signal?: AbortSignal
  /**
   * Hint that the system-prompt prefix is identical across a set of calls and
   * may benefit from provider-side prompt caching. Providers that support
   * automatic prefix caching (Groq, Cerebras, OpenRouter) can dedupe the
   * shared bytes; the hint is advisory and ignored by providers that don't.
   */
  cacheablePrefix?: boolean
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
  // If the caller supplied an already-aborted signal, fail immediately rather
  // than issuing a request we know we don't want. This matters for the swarm's
  // per-batch timeout: by the time a retry loop iterates, the batch may already
  // be cancelled.
  const externalSignal = init.signal
  if (externalSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  let lastError: Error | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Re-check before each attempt too: a signal aborted during a sleep should
    // not trigger a fresh request.
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    try {
      const res = await fetch(url, init)
      if (res.status === 429 && attempt < retries) {
        const retryAfter = res.headers.get('retry-after')
        const parsed = retryAfter != null ? parseInt(retryAfter, 10) * 1000 : NaN
        const delayMs = isNaN(parsed)
          ? Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
          : Math.min(parsed, MAX_DELAY_MS)
        await sleep(delayMs, externalSignal)
        continue
      }
      return res
    } catch (err) {
      // An explicit abort must not be retried or swallowed as a transient
      // network failure — propagate it so the caller sees a clean AbortError.
      if (err instanceof Error && err.name === 'AbortError') {
        throw err
      }
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        await sleep(Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS), externalSignal)
      }
    }
  }
  throw lastError ?? new Error('fetch failed')
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function createLimiter(maxConcurrency: number): LimitFunction {
  return pLimit(maxConcurrency)
}
