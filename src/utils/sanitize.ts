const REDACTED_KEYS = ['apikey', 'key', 'token', 'secret', 'password', 'authorization']

export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      REDACTED_KEYS.some((rk) => k.toLowerCase().includes(rk)) ? '[REDACTED]' : v,
    ])
  )
}

export function maskKey(key: string): string {
  if (key.length < 8) return '[REDACTED]'
  return key.slice(0, 4) + '...' + key.slice(-4)
}
