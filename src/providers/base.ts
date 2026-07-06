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

// Intentionally fixed: these govern the low-level HTTP retry loop shared by
// every adapter. They're not exposed via config because tuning them per-run
// would change retry timing underneath the router's own backoff/fallback
// logic in unpredictable ways; see CLAUDE.md's "Performance Tuning Knobs".
const MAX_RETRIES = 3
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 8000

const DAILY_LIMIT_PATTERN = /daily\s+limit|per[\s-]day|quota\s+exceed|out\s+of\s+quota/i

/**
 * Scans a raw response body for daily/per-day rate-limit language. Shared by
 * every adapter so daily-limit detection is a plain text scan regardless of
 * whether a provider's error body is JSON, wraps the message in `error.message`,
 * or isn't parseable JSON at all.
 */
export function isDailyLimitError(body: string): boolean {
  return DAILY_LIMIT_PATTERN.test(body)
}

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
        // Peek body before retrying — daily-limit errors are not transient.
        const body = await res.clone().text()
        if (isDailyLimitError(body)) {
          return res
        }
        const retryAfter = res.headers.get('retry-after')
        const parsed = retryAfter != null ? parseInt(retryAfter, 10) * 1000 : NaN
        // Honor an explicit server Retry-After up to 60s — clamping it to the
        // 8s backoff ceiling would retry inside the server's window and burn
        // every attempt on guaranteed 429s.
        const delayMs = isNaN(parsed)
          ? Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS) * (0.5 + Math.random() * 0.5)
          : Math.min(parsed, 60_000)
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
        await sleep(
          Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS) * (0.5 + Math.random() * 0.5),
          externalSignal
        )
      }
    }
  }
  throw lastError ?? new Error('fetch failed')
}

export function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
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
