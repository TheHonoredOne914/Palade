export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function retry<T>(fn: () => T, maxAttempts: number = 3): T {
  let lastError: Error | undefined
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return fn()
    } catch (err) {
      lastError = err as Error
    }
  }
  throw lastError
}
