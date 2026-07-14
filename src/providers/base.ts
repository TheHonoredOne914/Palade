import pLimit, { type LimitFunction } from 'p-limit'

export interface CompletionRequest {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  /**
   * Optional abort signal. When aborted, the in-flight provider request is
   * cancelled (the underlying fetch uses this signal) instead of continuing
   * to consume provider quota after the caller has given up on the result.
   */
  signal?: AbortSignal
}

export interface CompletionResponse {
  content: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  provider: string
  model: string
}

export interface IProvider {
  name: string
  model: string
  complete(req: CompletionRequest): Promise<CompletionResponse>
  /**
   * Whether this provider can currently serve requests. For every cloud
   * adapter (groq/cerebras/nvidia/openrouter/opencode-zen) this is a
   * quota-only check — it reflects locally observed daily-limit exhaustion
   * (see markDead/isDead), NOT a live connectivity/auth probe, so an invalid
   * API key or an unreachable endpoint still reports available=true here.
   * OllamaProvider is the one adapter that does an actual live probe (a GET
   * against its /api/tags endpoint), since a local server being down is the
   * common case worth detecting up front. initRouter's primary-provider
   * selection can therefore still pick a cloud provider with a dead key —
   * that failure surfaces on the first real complete() call instead.
   */
  isAvailable(): Promise<boolean>
  /**
   * Marks this provider instance exhausted/dead for the rest of the session.
   * Optional so adapters that don't track exhaustion state (rare) can omit
   * it. Exists so callers that wrap the same provider instance in multiple
   * chains (e.g. router.ts's primary and synthesis FallbackProvider chains)
   * can share one source of truth for "is this dead", instead of each chain
   * keeping its own separate dead-tracking Set that can disagree with the
   * others.
   */
  markDead?(): void
  /**
   * Synchronous "has markDead() been called on this instance" check. Kept
   * distinct from isAvailable() (which is async and, for some adapters, does
   * a live connectivity/quota probe unrelated to session-level dead marking)
   * so a chain-local pre-attempt skip check reflects only explicit dead
   * marking, not incidental unavailability.
   */
  isDead?(): boolean
  /**
   * Synchronous "was markDead() called because of an auth error
   * specifically" check, distinct from isDead() (which also covers quota
   * exhaustion). Router-side dead-marking is only ever triggered by an auth
   * error (a fatal quota error is self-marked by the adapter directly via
   * dailyLimitExhausted, never via markDead() — see router.ts's
   * providers-001 fix), so every adapter's own flag set by markDead() is
   * specifically auth-caused. Lets FallbackProvider.complete() surface
   * AuthError (instead of AllProvidersExhaustedError) when every chain
   * member is skipped this call because all were already marked dead from
   * auth errors in an earlier call (providers-005).
   */
  isDeadFromAuth?(): boolean
}

// Intentionally fixed: these govern the low-level HTTP retry loop shared by
// every adapter. They're not exposed via config because tuning them per-run
// would change retry timing underneath the router's own backoff/fallback
// logic in unpredictable ways; see CLAUDE.md's "Performance Tuning Knobs".
const MAX_RETRIES = 3
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 8000

// Single source of truth for the per-request deadline default, shared by
// every adapter (groq/cerebras/nvidia/openrouter/opencode-zen/ollama) — used
// to be independently redeclared as an identical module-level constant in
// each of those six files.
export const DEFAULT_DEADLINE_MS = 300_000

// Single source of truth for fatal-quota phrasing, shared with
// router.ts's FATAL_KEYWORDS — these two lists had drifted apart (this
// pattern was missing 'insufficient_quota' and 'monthly limit', which
// FATAL_KEYWORDS treated as fatal), so a provider whose body used one of
// those phrases wasn't marked exhausted here even though the router would
// separately mark it dead.
export const FATAL_QUOTA_KEYWORDS = [
  'per day',
  'per-day',
  'daily limit',
  'quota exceeded',
  'out of quota',
  'insufficient_quota',
  'monthly limit',
]

/**
 * Detects daily/per-day/quota-exhaustion errors. Shared by every adapter so a
 * false match doesn't permanently mark a healthy key exhausted for the
 * session. Prefers a structured `error.type`/`error.code` field from the
 * parsed JSON body (e.g. OpenAI-style `insufficient_quota`) when the body is
 * valid JSON and carries one — those fields are set deliberately by the
 * provider, so matching against them is far less prone to false positives
 * than scanning arbitrary text. Falls back to the plain-text substring scan
 * when the body doesn't parse as JSON, lacks a structured field, or the
 * structured field's value doesn't match a known keyword — a structured
 * field that's merely generic (e.g. `rate_limit_exceeded`) shouldn't stop the
 * raw message text from still being scanned for a real quota-exhaustion
 * signal.
 */
export function isDailyLimitError(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as {
      error?: { type?: string; code?: string; message?: string }
    }
    const structured = parsed?.error?.type ?? parsed?.error?.code
    if (typeof structured === 'string' && structured.length > 0) {
      const lower = structured.toLowerCase()
      if (FATAL_QUOTA_KEYWORDS.some((keyword) => lower.includes(keyword))) {
        return true
      }
      // The structured field is present but doesn't match a known keyword
      // (e.g. `{"error":{"type":"rate_limit_exceeded","message":"...monthly
      // limit exceeded..."}}`) — fall through to the raw text scan below
      // instead of returning false immediately, so the real signal in the
      // message body isn't missed just because the structured field itself
      // was generic.
    }
  } catch {
    // Not parseable JSON (or not an object) — fall through to the raw scan.
  }
  const lower = body.toLowerCase()
  return FATAL_QUOTA_KEYWORDS.some((keyword) => lower.includes(keyword))
}

// Attached to an Error thrown for a CONFIRMED 429/quota-exhaustion response
// (isDailyLimitError(body) already returned true for it) so router.ts's
// fatal-quota keyword scan only fires for errors an adapter has already
// classified as quota-related — mirroring isDailyLimitError's own
// "structured signal first" preference — instead of substring-scanning the
// message of ANY thrown error (including a genuinely unrelated non-429
// error whose raw body happens to contain a phrase like "monthly limit")
// (providers-002). Same tagging pattern as pool.ts's PROVIDER_POOL_SOURCE.
const QUOTA_ERROR_TAG = Symbol('quotaError')

export function tagQuotaError(err: Error): Error {
  ;(err as Error & { [QUOTA_ERROR_TAG]?: true })[QUOTA_ERROR_TAG] = true
  return err
}

export function isQuotaTaggedError(err: unknown): boolean {
  return (
    err instanceof Error && Boolean((err as Error & { [QUOTA_ERROR_TAG]?: true })[QUOTA_ERROR_TAG])
  )
}

/**
 * Standard message for a 429 response that isn't a daily/quota exhaustion
 * (isDailyLimitError said no) — by the time an adapter reaches this, the
 * shared fetchWithRetry() above has already exhausted its retry budget for
 * retryable statuses (including 429), so there's nothing left to do but
 * classify and surface. Shared so every adapter reports a retries-exhausted
 * 429 identically instead of some (openrouter/opencode-zen) using this
 * distinct wording while others (groq/cerebras/nvidia) fell through to a
 * generic "<Name> error 429: ..." message (providers-004).
 */
export function rateLimitedMessage(providerLabel: string, body: string): string {
  return `${providerLabel} rate limited — retries exhausted. ${body.slice(0, 200)}`
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  // If the caller supplied an already-aborted signal, fail immediately rather
  // than issuing a request we know we don't want. This matters for the swarm's
  // per-batch timeout: by the time a retry loop iterates, the batch may already
  // be cancelled.
  const externalSignal = init.signal
  if (externalSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  let lastError: Error | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Re-check before each attempt too: a signal aborted during a sleep should
    // not trigger a fresh request.
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    try {
      const res = await fetch(url, init)
      if (res.status === 429 && attempt < retries) {
        // Peek body before retrying — daily-limit errors are not transient.
        const body = await res.clone().text()
        if (isDailyLimitError(body)) {
          return res
        }
        const retryAfter = res.headers.get('retry-after')
        const parsed = retryAfter != null ? parseInt(retryAfter, 10) * 1000 : NaN
        // Honor an explicit server Retry-After up to 60s — clamping it to the
        // 8s backoff ceiling would retry inside the server's window and burn
        // every attempt on guaranteed 429s.
        const delayMs = isNaN(parsed)
          ? Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS) * (0.5 + Math.random() * 0.5)
          : Math.min(parsed, 60_000)
        await sleep(delayMs, externalSignal)
        continue
      }
      if ([500, 502, 503, 504].includes(res.status) && attempt < retries) {
        // Same jitter as the 429 and network-error retry paths below — without
        // it, concurrent batches hitting the same outage all retry in lockstep
        // instead of spreading their retries out.
        await sleep(
          Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS) * (0.5 + Math.random() * 0.5),
          externalSignal
        )
        continue
      }
      return res
    } catch (err) {
      // An explicit abort must not be retried or swallowed as a transient
      // network failure — propagate it so the caller sees a clean AbortError.
      if (err instanceof Error && err.name === 'AbortError') {
        throw err
      }
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        await sleep(
          Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS) * (0.5 + Math.random() * 0.5),
          externalSignal
        )
      }
    }
  }
  throw lastError ?? new Error('fetch failed')
}

export function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function createLimiter(maxConcurrency: number): LimitFunction {
  return pLimit(maxConcurrency)
}

// Shared by every adapter (groq/cerebras/nvidia/openrouter/opencode-zen/ollama):
// if a model consumes its whole output-token budget but returns no visible
// content (e.g. reasoning-only output), retrying with a larger token budget
// often recovers real content instead of surfacing an empty response.
const MAX_RETRY_TOKENS = 32768

export function shouldRetryEmptyContent(
  content: string,
  outputTokens: number,
  attempt: number,
  maxAttempts = 2
): boolean {
  return content.trim().length === 0 && outputTokens > 0 && attempt < maxAttempts
}

export function nextRetryMaxTokens(maxTokens: number, ceiling: number = MAX_RETRY_TOKENS): number {
  return Math.min(maxTokens * 2, ceiling)
}
