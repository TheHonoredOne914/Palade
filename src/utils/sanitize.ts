const REDACTED_KEYS = ['apikey', 'key', 'token', 'secret', 'password', 'authorization']

export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      const isSecret = REDACTED_KEYS.some((rk) => k.toLowerCase().includes(rk))
      if (isSecret) return [k, '[REDACTED]']
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        return [k, sanitizeForLog(v as Record<string, unknown>)]
      }
      return [k, v]
    })
  )
}

export function maskKey(key: string): string {
  if (key.length < 8) return '[REDACTED]'
  return key.slice(0, 4) + '...' + key.slice(-4)
}
