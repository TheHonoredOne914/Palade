import { type LimitFunction } from 'p-limit';
export interface CompletionRequest {
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
    /**
     * Optional abort signal. When aborted, the in-flight provider request is
     * cancelled (the underlying fetch uses this signal) instead of continuing
     * to consume provider quota after the caller has given up on the result.
     */
    signal?: AbortSignal;
}
export interface CompletionResponse {
    content: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    provider: string;
    model: string;
}
export interface IProvider {
    name: string;
    model: string;
    complete(req: CompletionRequest): Promise<CompletionResponse>;
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
    isAvailable(): Promise<boolean>;
    /**
     * Marks this provider instance exhausted/dead for the rest of the session.
     * Optional so adapters that don't track exhaustion state (rare) can omit
     * it. Exists so callers that wrap the same provider instance in multiple
     * chains (e.g. router.ts's primary and synthesis FallbackProvider chains)
     * can share one source of truth for "is this dead", instead of each chain
     * keeping its own separate dead-tracking Set that can disagree with the
     * others.
     */
    markDead?(): void;
    /**
     * Synchronous "has markDead() been called on this instance" check. Kept
     * distinct from isAvailable() (which is async and, for some adapters, does
     * a live connectivity/quota probe unrelated to session-level dead marking)
     * so a chain-local pre-attempt skip check reflects only explicit dead
     * marking, not incidental unavailability.
     */
    isDead?(): boolean;
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
    isDeadFromAuth?(): boolean;
}
export declare const DEFAULT_DEADLINE_MS = 300000;
export declare const FATAL_QUOTA_KEYWORDS: string[];
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
export declare function isDailyLimitError(body: string): boolean;
export declare function tagQuotaError(err: Error): Error;
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
export declare function rateLimitedMessage(providerLabel: string, body: string): string;
export declare function fetchWithRetry(url: string, init: RequestInit, retries?: number): Promise<Response>;
export declare function sleep(ms: number, signal?: AbortSignal | null): Promise<void>;
export declare function createLimiter(maxConcurrency: number): LimitFunction;
export declare function shouldRetryEmptyContent(content: string, outputTokens: number, attempt: number, maxAttempts?: number): boolean;
export declare function nextRetryMaxTokens(maxTokens: number, ceiling?: number): number;
