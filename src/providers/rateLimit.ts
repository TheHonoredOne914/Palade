export interface RetryOptions {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  retryOn: (status: number) => boolean
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  retryOn: (s: number) => s === 429,
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  fn: () => Promise<{ status: number; body: T }>,
  opts: Partial<RetryOptions> = {}
): Promise<T> {
  const options = { ...DEFAULT_RETRY_OPTIONS, ...opts }

  let lastError: Error | undefined
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      const result = await fn()

      if (result.status === 200) return result.body

      if (options.retryOn(result.status) && attempt < options.maxAttempts - 1) {
        const delay = Math.min(
          options.baseDelayMs * Math.pow(2, attempt),
          options.maxDelayMs
        )
        await sleep(delay)
        continue
      }

      throw new Error(`HTTP ${result.status}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const isRetryable =
        lastError.message.includes('429') ||
        lastError.message.includes('rate limit') ||
        lastError.message.includes('502') ||
        lastError.message.includes('503') ||
        lastError.message.includes('timeout')

      if (isRetryable && attempt < options.maxAttempts - 1) {
        const delay = Math.min(
          options.baseDelayMs * Math.pow(2, attempt),
          options.maxDelayMs
        )
        await sleep(delay)
        continue
      }

      throw lastError
    }
  }

  throw lastError ?? new Error(`Max retry attempts (${options.maxAttempts}) exceeded`)
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3
): Promise<Response> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.status === 429 && attempt < retries) {
        const retryAfter = res.headers.get('retry-after')
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(500 * 2 ** attempt, 8000)
        await sleep(delayMs)
        continue
      }
      return res
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        await sleep(Math.min(500 * 2 ** attempt, 8000))
      }
    }
  }
  throw lastError ?? new Error('fetch failed')
}
