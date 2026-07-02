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
      const isFatal = fatalErrors.some((msg) =>
        error.message.toLowerCase().includes(msg.toLowerCase())
      )
      const isRetryable = retryableErrors.some((msg) =>
        error.message.toLowerCase().includes(msg.toLowerCase())
      )

      if (isFatal || !isRetryable || attempt >= maxRetries) {
        throw error
      }

      attempt++
      // Cap the exponential base first, then add jitter within the remaining
      // headroom below the cap. This keeps the total delay strictly <= maxDelayMs
      // (the old form added jitter before the cap, so at the cap the jitter was
      // silently truncated and every retry hit exactly maxDelayMs).
      const cappedBase = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      const jitter = Math.random() * Math.min(500, maxDelayMs - cappedBase)
      const delay = cappedBase + jitter

      console.warn(
        `[backoff] attempt ${attempt}/${maxRetries} after ${Math.round(delay)}ms — ${error.message}`
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
