import { AuthError } from '../errors/types.js'

// Single source of truth for fatal-auth classification, shared by
// orchestrator/swarm.ts and providers/router.ts. Both used to keep their own
// copy of this logic (they had drifted apart before other keyword lists in
// this codebase were unified — see FATAL_QUOTA_KEYWORDS in base.ts), so it's
// extracted here to avoid a repeat. Lives under providers/ (not orchestrator/)
// so router.ts can import it without swarm.ts -> router.ts -> swarm.ts cycle.
//
// Every adapter (groq/cerebras/nvidia/openrouter/opencode-zen/ollama) attaches
// a structured `status` by throwing AuthError on a 401/403 response — prefer
// that structured field first. The message-text scan below is only a fallback
// for errors that didn't come through that path (e.g. a fetch-level failure
// or a provider error type we haven't wrapped yet); word-boundary regexes
// there avoid false positives on unrelated text that merely contains these
// digits.
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
