export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number
    baseDelayMs: number
    maxDelayMs: number
    retryableErrors: string[]
    fatalErrors?: string[]
    signal?: AbortSignal
  }
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, retryableErrors, fatalErrors = [], signal } = options
  let attempt = 0

  while (true) {
    try {
      return await fn()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const isFatal = fatalErrors.some((msg) =>
        error.message.toLowerCase().includes(msg.toLowerCase())
      )
      const isRetryable = retryableErrors.some((msg) =>
        error.message.toLowerCase().includes(msg.toLowerCase())
      )

      if (isFatal || !isRetryable || attempt >= maxRetries || signal?.aborted) {
        throw error
      }

      // Compute the delay from the attempt count BEFORE incrementing it, so the
      // first retry (attempt 0) waits base*2^0 = base instead of base*2.
      const jitter = Math.random() * 500
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, maxDelayMs)
      attempt++

      console.warn(
        `[backoff] attempt ${attempt}/${maxRetries} after ${Math.round(delay)}ms — ${error.message}`
      )

      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer)
          reject(new DOMException('Aborted', 'AbortError'))
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }, delay)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  }
}
