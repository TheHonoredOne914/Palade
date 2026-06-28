export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number
    baseDelayMs: number
    maxDelayMs: number
    retryableErrors: string[]
    fatalErrors?: string[]
  }
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, retryableErrors, fatalErrors = [] } = options
  let attempt = 0

  while (true) {
    try {
      return await fn()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const isFatal = fatalErrors.some((msg) => error.message.toLowerCase().includes(msg.toLowerCase()))
      const isRetryable = retryableErrors.some((msg) => error.message.toLowerCase().includes(msg.toLowerCase()))

      if (isFatal || !isRetryable || attempt >= maxRetries) {
        throw error
      }

      attempt++
      const jitter = Math.random() * 500
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, maxDelayMs)

      console.warn(
        `[backoff] attempt ${attempt}/${maxRetries} after ${Math.round(delay)}ms — ${error.message}`
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
