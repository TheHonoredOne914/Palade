const REDACTED_KEYS = ['apikey', 'key', 'token', 'secret', 'password', 'authorization'];
export function sanitizeForLog(obj) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => {
        const isSecret = REDACTED_KEYS.some((rk) => k.toLowerCase().includes(rk));
        if (isSecret)
            return [k, '[REDACTED]'];
        if (Array.isArray(v)) {
            const sanitizeValue = (val) => Array.isArray(val)
                ? val.map(sanitizeValue)
                : val !== null && typeof val === 'object'
                    ? sanitizeForLog(val)
                    : val;
            return [k, v.map(sanitizeValue)];
        }
        if (v !== null && typeof v === 'object') {
            return [k, sanitizeForLog(v)];
        }
        return [k, v];
    }));
}
export function maskKey(key) {
    // At 8 chars, first-4 + last-4 would reveal the entire key
    if (key.length <= 8)
        return '[REDACTED]';
    return key.slice(0, 4) + '...' + key.slice(-4);
}
// Matches long alnum/-/_/. runs — the shape of most provider API keys. A
// provider's raw HTTP error body (echoed verbatim into thrown Error messages
// by every adapter, see providers/base.ts) could theoretically include the
// submitted key back in the response text; redacting anything key-shaped
// before a message hits stdout/logs is strictly safer than trusting that
// never happens.
const KEY_LIKE_PATTERN = /\b[A-Za-z0-9_.-]{20,}\b/g;
/** Redacts key-shaped substrings from free-form log text using maskKey(). */
export function sanitizeErrorMessage(text) {
    return text.replace(KEY_LIKE_PATTERN, (match) => maskKey(match));
}
