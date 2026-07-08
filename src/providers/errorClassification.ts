import { AuthError } from '../errors/types.js'

// Single source of truth for fatal-auth classification, shared by
// orchestrator/swarm.ts and providers/router.ts. Both used to keep their own
// copy of this logic (they had drifted apart before other keyword lists in
// this codebase were unified — see FATAL_QUOTA_KEYWORDS in base.ts), so it's
// extracted here to avoid a repeat. Lives under providers/ (not orchestrator/)
// so router.ts can import it without swarm.ts -> router.ts -> swarm.ts cycle.
//
// Every adapter (groq/cerebras/nvidia/openrouter/opencode-zen/ollama) attaches
// a structured `status` by throwing AuthError on a 401/403 response — this
// checks only that structured field. There is deliberately no message-text
// substring/regex fallback: this codebase has repeatedly had that kind of
// fake-validation logic removed in prior audit rounds, so an error that isn't
// wrapped in AuthError is treated as non-fatal here.
export function isFatalAuthError(err: Error): boolean {
  return err instanceof AuthError
}
