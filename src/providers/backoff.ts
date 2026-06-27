export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number
    baseDelayMs: number
    maxDelayMs: number
    retryableErrors: string[]
  }
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, retryableErrors } = options
  let attempt = 0

  while (true) {
    try {
      return await fn()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const isRetryable = retryableErrors.some((msg) => error.message.includes(msg))

      if (!isRetryable || attempt >= maxRetries) {
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
