import { AuthError } from '../errors/types.js'

// Single source of truth for fatal-auth classification, shared by
// orchestrator/swarm.ts and providers/router.ts. Both used to keep their own
// copy of this logic (they had drifted apart before other keyword lists in
// this codebase were unified — see FATAL_QUOTA_KEYWORDS in base.ts), so it's
// extracted here to avoid a repeat. Lives under providers/ (not orchestrator/)
// so router.ts can import it without swarm.ts -> router.ts -> swarm.ts cycle.
//
// Providers don't expose a structured status/code field on thrown errors —
// they're plain Errors with the status baked into the message string (see
// src/providers/*.ts, e.g. `Cerebras error 401: ...`) — so we're stuck
// pattern-matching on the message. Word-boundary regexes avoid false
// positives on unrelated text that merely contains these digits.
export function isFatalAuthError(err: Error): boolean {
  if (err instanceof AuthError) return true
  const msg = err.message.toLowerCase()
  return (
    /\b401\b/.test(msg) ||
    /\b403\b/.test(msg) ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('authentication')
  )
}
