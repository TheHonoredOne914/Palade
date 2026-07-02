const REDACTED_KEYS = ['apikey', 'key', 'token', 'secret', 'password', 'authorization']

// Only recurse into plain objects. Arrays, typed arrays, Buffers, Maps, Dates,
// and other exotic objects would be mangled into index-keyed records by
// Object.entries, so they are passed through untouched.
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  if (Array.isArray(v)) return false
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      const isSecret = REDACTED_KEYS.some((rk) => k.toLowerCase().includes(rk))
      if (isSecret) return [k, '[REDACTED]']
      if (isPlainObject(v)) {
        return [k, sanitizeForLog(v)]
      }
      return [k, v]
    })
  )
}

export function maskKey(key: string): string {
  if (key.length < 8) return '[REDACTED]'
  return key.slice(0, 4) + '...' + key.slice(-4)
}
