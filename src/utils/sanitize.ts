const REDACTED_KEYS = ['apikey', 'key', 'token', 'secret', 'password', 'authorization']

export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      const isSecret = REDACTED_KEYS.some((rk) => k.toLowerCase().includes(rk))
      if (isSecret) return [k, '[REDACTED]']
      if (Array.isArray(v)) {
        const sanitizeValue = (val: unknown): unknown =>
          Array.isArray(val)
            ? val.map(sanitizeValue)
            : val !== null && typeof val === 'object'
              ? sanitizeForLog(val as Record<string, unknown>)
              : val
        return [k, v.map(sanitizeValue)]
      }
      if (v !== null && typeof v === 'object') {
        return [k, sanitizeForLog(v as Record<string, unknown>)]
      }
      return [k, v]
    })
  )
}

export function maskKey(key: string): string {
  // At 8 chars, first-4 + last-4 would reveal the entire key
  if (key.length <= 8) return '[REDACTED]'
  return key.slice(0, 4) + '...' + key.slice(-4)
}

// Matches long alnum/-/_/./+//= runs — the shape of most provider API keys
// AND base64-encoded tokens (which use +, /, and = padding — chars the old
// class excluded, so a base64 token got split at those boundaries and each
// fragment passed through unredacted (rep-008)). A provider's raw HTTP error
// body (echoed verbatim into thrown Error messages by every adapter, see
// providers/base.ts) could theoretically include the submitted key back in
// the response text; redacting anything key-shaped before a message hits
// stdout/logs is strictly safer than trusting that never happens. No
// trailing \b: '=' padding (and other included chars) are non-word
// characters, so a trailing \b would require a following word character —
// wrongly refusing to match a key/token that ends the string or is followed
// by whitespace/punctuation, which is the common case.
const KEY_LIKE_PATTERN = /\b[A-Za-z0-9_.+/=-]{20,}/g

/** Redacts key-shaped substrings from free-form log text using maskKey(). */
export function sanitizeErrorMessage(text: string): string {
  return text.replace(KEY_LIKE_PATTERN, (match) => maskKey(match))
}
