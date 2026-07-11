import chalk from 'chalk'
import type { PaladeConfig } from '../config/schema.js'
import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { FATAL_QUOTA_KEYWORDS, isQuotaTaggedError } from './base.js'
import { GroqProvider } from './groq.js'
import { CerebrasProvider } from './cerebras.js'
import { NoProvidersError, AuthError } from '../errors/types.js'
import { isFatalAuthError } from './errorClassification.js'
import { NvidiaProvider } from './nvidia.js'
import { OpenRouterProvider } from './openrouter.js'
import { OpenCodeZenProvider } from './opencode-zen.js'
import OllamaProvider from './ollama.js'
import { ProviderPool, PROVIDER_POOL_SOURCE, type PoolSourceTaggedError } from './pool.js'
import { sanitizeErrorMessage } from '../utils/sanitize.js'

// Marks the specific provider instance responsible for a fatal error dead,
// rather than the chain entry itself. When `provider` is a ProviderPool
// wrapping several keys, calling `provider.markDead?.()` directly would mark
// EVERY member dead over one bad key's fatal error — pool.ts tags thrown
// errors with the exact member that threw (PROVIDER_POOL_SOURCE) so we can
// scope the marking down to just that one instance instead.
function markResponsibleProviderDead(provider: IProvider, error: Error): void {
  const source = (error as PoolSourceTaggedError)[PROVIDER_POOL_SOURCE]
  ;(source ?? provider).markDead?.()
}

export class AllProvidersExhaustedError extends Error {
  constructor(public readonly attempts: { provider: string; finalError: string }[]) {
    super(`All ${attempts.length} providers failed. See .attempts for details.`)
    this.name = 'AllProvidersExhaustedError'
  }
}

// Bare 'daily' / 'quota' used to be fatal keywords, which meant an incidental
// occurrence of either word in an unrelated error body would
// permanently mark a provider dead. Tightened to the specific phrases our
// adapters actually throw (see groq.ts/cerebras.ts/nvidia.ts/openrouter.ts/
// opencode-zen.ts daily-limit messages) so a stray 'daily' or 'quota'
// substring elsewhere in a body can't trip this.
// Imported from base.ts (not redeclared here) so this stays in lockstep with
// isDailyLimitError's body-scan — the two independently-maintained copies had
// drifted apart before (this list had 'insufficient_quota'/'monthly limit',
// isDailyLimitError's regex didn't).
const FATAL_KEYWORDS = FATAL_QUOTA_KEYWORDS

// Only scan for fatal-quota phrasing on an error the adapter has ALREADY
// classified as quota/429-related (via base.ts's tagQuotaError, set only
// when isDailyLimitError(body) matched on an actual 429 response) — mirrors
// isDailyLimitError's own "trust a structured signal first" approach.
// Previously this scanned the message text of ANY thrown error regardless of
// HTTP status, so a genuinely unrelated non-429 error whose raw body
// happened to contain a phrase like "monthly limit" was misclassified as a
// fatal quota exhaustion (providers-002).
function isFatalMessage(error: Error): boolean {
  if (!isQuotaTaggedError(error)) return false
  const lower = error.message.toLowerCase()
  return FATAL_KEYWORDS.some((keyword) => lower.includes(keyword))
}

export type ProviderRole = 'primary' | 'synthesis' | 'triage'

export interface ProviderAssignment {
  primary: IProvider
  synthesis: IProvider
  triage: IProvider
}

interface ProviderConfig {
  apiKey: string
  apiKeys?: string[]
  model?: string
  maxConcurrency?: number
  baseUrl?: string
  timeoutMs?: number
  /** openrouter-only; ignored by every other adapter's factory below. */
  referer?: string
  title?: string
}

// Single source of truth for the set of provider names Palade supports —
// previously duplicated as the createProviderInstances switch's case labels
// AND instantiateProviders' loop array, which could (and did) drift apart if
// one was updated without the other (providers-007). PROVIDER_FACTORIES is a
// Record keyed by this exact tuple, so TypeScript enforces that every name
// here has a matching factory (and vice versa) at compile time.
export const PROVIDER_NAMES = [
  'opencode-zen',
  'nvidia',
  'groq',
  'cerebras',
  'openrouter',
  'ollama',
] as const

export type SupportedProviderName = (typeof PROVIDER_NAMES)[number]

const PROVIDER_FACTORIES: Record<
  SupportedProviderName,
  (key: string, cfg: ProviderConfig) => IProvider
> = {
  groq: (key, cfg) =>
    new GroqProvider(key, cfg.model, cfg.maxConcurrency, cfg.baseUrl, cfg.timeoutMs),
  cerebras: (key, cfg) =>
    new CerebrasProvider(key, cfg.model, cfg.maxConcurrency, cfg.baseUrl, cfg.timeoutMs),
  nvidia: (key, cfg) =>
    new NvidiaProvider(key, cfg.model, cfg.maxConcurrency, cfg.baseUrl, cfg.timeoutMs),
  openrouter: (key, cfg) =>
    new OpenRouterProvider(
      key,
      cfg.model,
      cfg.maxConcurrency,
      cfg.baseUrl,
      cfg.timeoutMs,
      cfg.referer,
      cfg.title
    ),
  'opencode-zen': (key, cfg) =>
    new OpenCodeZenProvider(key, cfg.model, cfg.maxConcurrency, cfg.baseUrl, cfg.timeoutMs),
  // Ollama is keyless — `key` (an empty-string apiKey placeholder, see
  // instantiateProviders' usable check) is intentionally unused here.
  ollama: (_key, cfg) =>
    new OllamaProvider(cfg.model, cfg.baseUrl, cfg.maxConcurrency, cfg.timeoutMs),
}

function createProviderInstances(name: SupportedProviderName, cfg: ProviderConfig): IProvider[] {
  const allKeys = cfg.apiKeys?.length ? cfg.apiKeys : [cfg.apiKey]
  return allKeys.map((key) => PROVIDER_FACTORIES[name](key, cfg))
}

function instantiateProviders(providers: PaladeConfig['providers']): Map<string, IProvider> {
  const map = new Map<string, IProvider>()

  for (const name of PROVIDER_NAMES) {
    const cfg = providers[name as keyof PaladeConfig['providers']]
    // Ollama is keyless — a configured entry is enough. All other providers
    // need a non-empty apiKey.
    const usable = name === 'ollama' ? Boolean(cfg) : cfg && 'apiKey' in cfg && cfg.apiKey
    if (cfg && usable) {
      const instances = createProviderInstances(name, cfg as ProviderConfig)
      if (instances.length === 1) {
        map.set(name, instances[0])
      } else if (instances.length > 1) {
        map.set(name, new ProviderPool(name, instances))
      }
    }
  }

  return map
}

let assignment: ProviderAssignment | null = null
let allProviders: Map<string, IProvider> = new Map()

export class FallbackProvider implements IProvider {
  private chain: IProvider[]
  private _fallbackCount = 0
  private _totalCount = 0
  // Per-role call counters, so a single FallbackProvider instance shared
  // across multiple roles (e.g. when no dedicated triage provider is
  // configured and triageWithFallback IS primaryWithFallback — see
  // initRouter's providers-005 note below) can still report separate stats
  // for calls made in the 'triage' role vs the 'primary' role, instead of
  // folding triage calls into the primary totals above.
  private readonly roleStats = new Map<ProviderRole, { total: number; fallbacks: number }>()

  constructor(primary: IProvider, fallbacks: IProvider[]) {
    this.chain = [primary, ...fallbacks]
  }

  get name() {
    return this.chain[0].name
  }
  get model() {
    return this.chain[0].model
  }

  /** Number of calls that fell back to a non-primary provider. */
  get fallbackCount() {
    return this._fallbackCount
  }
  /** Total calls attempted. */
  get totalCount() {
    return this._totalCount
  }

  /** Record one call's outcome under `role`, for role-separated stats (providers-005). */
  recordRoleCall(role: ProviderRole, usedFallback: boolean): void {
    const stats = this.roleStats.get(role) ?? { total: 0, fallbacks: 0 }
    stats.total++
    if (usedFallback) stats.fallbacks++
    this.roleStats.set(role, stats)
  }

  getRoleStats(role: ProviderRole): { total: number; fallbacks: number } {
    return this.roleStats.get(role) ?? { total: 0, fallbacks: 0 }
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    // Try primary provider first, fall back on error
    this._totalCount++

    let lastError: Error | undefined
    const primaryProvider = this.chain[0]

    const attempts: { provider: string; finalError: string }[] = []
    // If every provider we actually invoked this call failed with an
    // auth-classified error, the whole run is doomed regardless of which
    // provider we try next — surface that as an AuthError so swarm.ts's
    // isFatalAuthError can abort the run instead of exhausting retries on a
    // dead API key. attemptedAny guards against an all-skipped chain (every
    // member already marked dead) reporting a false auth failure.
    let attemptedAny = false
    let allAttemptsAuthLike = true
    let lastAuthLikeError: Error | undefined

    for (let i = 0; i < this.chain.length; i++) {
      const provider = this.chain[i]

      // Check the provider instance's own dead flag rather than a chain-local
      // Set — the same instance can be wrapped by multiple FallbackProvider
      // chains (e.g. router.ts's primary and synthesis chains), so
      // dead/exhausted state must live on the shared instance to stay in
      // sync across chains. Uses the dedicated isDead() (not isAvailable(),
      // which can be false for unrelated reasons, e.g. a live connectivity
      // probe) so this only skips providers explicitly marked dead this
      // session.
      if (provider.isDead?.()) {
        attempts.push({
          provider: provider.name,
          finalError: 'skipped — marked dead earlier this session (hard quota limit)',
        })
        continue
      }

      try {
        const response = await provider.complete(req)

        if (provider !== primaryProvider) {
          this._fallbackCount++
          return { ...response, provider: provider.name, model: provider.model }
        }
        return response
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        attempts.push({
          provider: provider.name,
          finalError: sanitizeErrorMessage(lastError.message),
        })
        attemptedAny = true

        const isFatal = isFatalMessage(lastError)
        if (isFatalAuthError(lastError)) {
          lastAuthLikeError = lastError
        } else {
          allAttemptsAuthLike = false
        }

        // No router-side dead-marking needed for the isFatal (quota) case:
        // isFatalMessage() only returns true for errors the adapter itself
        // already tagged via tagQuotaError() — and every adapter sets its own
        // dailyLimitExhausted flag (which isDead()/isAvailable() already
        // read) BEFORE throwing, as a precondition for reaching that
        // classification at all. So the responsible instance is already dead
        // by the time we get here; calling markResponsibleProviderDead()
        // there would be a no-op (providers-001) — adapters' self-marking is
        // the actual source of truth.
        if (!isFatal && isFatalAuthError(lastError)) {
          // A 401/403 means the key itself is invalid — unlike the quota case
          // above, isAvailable() is a quota-only check and can never detect
          // this, so gating on "stillAvailable" would never mark the provider
          // dead and it would be retried as primary on every subsequent call
          // for the rest of the run. Mark it dead unconditionally instead —
          // scoped to the specific member that threw (see
          // markResponsibleProviderDead) so a single bad key's auth failure
          // doesn't take down its healthy pool siblings.
          markResponsibleProviderDead(provider, lastError)
          console.warn(chalk.red(`[router] provider ${provider.name} marked as DEAD (auth error)`))
        }

        // Default to trying the next provider regardless of error type — an
        // error on this provider (e.g. a bad key) doesn't mean every other
        // provider in the chain will fail the same way, so give them a
        // chance before giving up entirely.
        if (i < this.chain.length - 1) {
          console.warn(chalk.yellow(`[router] provider ${provider.name} failed, trying next`))
          console.warn(
            chalk.dim(
              `         → ${sanitizeErrorMessage(lastError.message.split('\n')[0].slice(0, 120))}`
            )
          )
        } else {
          // Last in chain — surface the real error so users can diagnose
          console.warn(
            chalk.red(
              `[router] provider ${provider.name} failed: ${sanitizeErrorMessage(lastError.message.split('\n')[0].slice(0, 200))}`
            )
          )
        }
        continue
      }
    }

    if (attemptedAny && allAttemptsAuthLike) {
      const status = lastAuthLikeError instanceof AuthError ? lastAuthLikeError.status : 401
      const providerName =
        lastAuthLikeError instanceof AuthError
          ? lastAuthLikeError.providerName
          : this.chain[this.chain.length - 1].name
      throw new AuthError(
        `All ${attempts.length} providers failed with auth errors. ` +
          attempts.map((a) => `${a.provider}: ${a.finalError}`).join(' | '),
        status,
        providerName
      )
    }

    // Every chain member was already marked dead before this call even
    // started (e.g. from a concurrent call moments earlier), so the loop
    // above skipped them all via isDead() and attemptedAny stayed false.
    // If that dead state is uniformly auth-caused, the run is just as doomed
    // as if we'd attempted and failed this call — surface AuthError so
    // swarm.ts's isFatalAuthError check triggers a fast run-wide abort
    // instead of grinding through further futile calls to a dead key
    // (providers-005).
    if (!attemptedAny && this.chain.every((p) => p.isDeadFromAuth?.() ?? false)) {
      throw new AuthError(
        `All ${this.chain.length} providers are already marked dead from auth errors earlier this session.`,
        401,
        this.chain[this.chain.length - 1].name
      )
    }

    throw new AllProvidersExhaustedError(attempts)
  }

  async isAvailable(): Promise<boolean> {
    // Check if ANY provider in the chain is available — checking only the
    // primary (chain[0]) makes the entire FallbackProvider appear dead when
    // the primary is down (e.g. daily quota exhausted) even though fallbacks
    // could still serve requests.
    for (const p of this.chain) {
      if (await p.isAvailable()) return true
    }
    return false
  }
}

function getFallbackChain(excludeName: string): IProvider[] {
  const fallbacks: IProvider[] = []
  for (const [name, provider] of allProviders) {
    if (name !== excludeName) {
      fallbacks.push(provider)
    }
  }
  return fallbacks
}

export async function initRouter(config: PaladeConfig): Promise<ProviderAssignment> {
  activeConfig = config
  allProviders = instantiateProviders(config.providers)

  const names = Array.from(allProviders.keys())
  const availability = await Promise.all(names.map((n) => allProviders.get(n)!.isAvailable()))

  // Assign primary
  let primary: IProvider | undefined
  const preferredPrimary = config.swarm.primary
  if (allProviders.has(preferredPrimary) && availability[names.indexOf(preferredPrimary)]) {
    primary = allProviders.get(preferredPrimary)
  } else {
    for (let i = 0; i < names.length; i++) {
      if (availability[i]) {
        primary = allProviders.get(names[i])
        break
      }
    }
  }

  if (!primary) {
    throw new NoProvidersError()
  }

  // Assign synthesis
  let synthesis: IProvider
  const preferredSynthesis = config.swarm.synthesis
  if (allProviders.has(preferredSynthesis) && availability[names.indexOf(preferredSynthesis)]) {
    synthesis = allProviders.get(preferredSynthesis)!
  } else {
    synthesis = primary
  }

  // Wrap with fallback
  const primaryWithFallback = new FallbackProvider(primary, getFallbackChain(primary.name))
  const synthesisWithFallback = new FallbackProvider(synthesis, getFallbackChain(synthesis.name))

  // Assign triage: an explicit cheap/fast tier if configured and available,
  // otherwise reuse the already-wrapped primary chain rather than building a
  // redundant fallback chain around the same provider.
  //
  // (providers-005): when no dedicated triage provider is configured,
  // triageWithFallback IS primaryWithFallback (the same FallbackProvider
  // instance). getProvider() below wraps every returned provider with
  // withRoleStats(), which records each call under the role it was actually
  // requested as (via FallbackProvider.recordRoleCall) — so getFallbackStats()
  // can still report separate primary/triage totals even when they share the
  // same underlying instance, instead of triage calls silently folding into
  // the primary counters.
  const preferredTriage = config.swarm.triage
  let triageWithFallback: IProvider = primaryWithFallback
  if (
    preferredTriage &&
    allProviders.has(preferredTriage) &&
    availability[names.indexOf(preferredTriage)]
  ) {
    const triage = allProviders.get(preferredTriage)!
    triageWithFallback = new FallbackProvider(triage, getFallbackChain(triage.name))
  }

  const result: ProviderAssignment = {
    primary: primaryWithFallback,
    synthesis: synthesisWithFallback,
    triage: triageWithFallback,
  }
  assignment = result

  return result
}

let activeConfig: PaladeConfig | null = null
const agentAssignments = new Map<string, IProvider>()

/**
 * Wrap a provider so every complete() call made through this reference is
 * attributed to `role` in the underlying FallbackProvider's role-tagged
 * counters (see FallbackProvider.recordRoleCall) — this is what lets
 * getFallbackStats() separate triage calls from primary calls even when
 * initRouter() assigned the very same FallbackProvider instance to both
 * roles (providers-005). A no-op for non-FallbackProvider instances (e.g. a
 * bare adapter never wrapped with fallbacks).
 */
function withRoleStats(provider: IProvider, role: ProviderRole): IProvider {
  if (!(provider instanceof FallbackProvider)) return provider
  // FallbackProvider itself never implements markDead/isDead (nothing calls
  // them ON a FallbackProvider — router.ts's fatal-error handling always
  // marks the specific underlying chain member dead, via
  // markResponsibleProviderDead), so this wrapper only needs to forward the
  // members FallbackProvider actually has.
  return {
    name: provider.name,
    model: provider.model,
    isAvailable: () => provider.isAvailable(),
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      const primaryName = provider.name
      const response = await provider.complete(req)
      provider.recordRoleCall(role, response.provider !== primaryName)
      return response
    },
  }
}

export function getProvider(role: ProviderRole, agentName?: string): IProvider {
  if (!assignment || !activeConfig) {
    throw new Error('Router not initialized. Call initRouter() first.')
  }

  if (role === 'primary' && agentName && activeConfig.swarm.agentProviders?.[agentName]) {
    const overrideName = activeConfig.swarm.agentProviders[agentName]

    // Check if we already cached a FallbackProvider for this agent
    const cacheKey = `${agentName}:${overrideName}`
    if (agentAssignments.has(cacheKey)) {
      return withRoleStats(agentAssignments.get(cacheKey)!, role)
    }

    // Create a new FallbackProvider starting with the requested override
    const provider = allProviders.get(overrideName)
    if (provider) {
      const pWithFallback = new FallbackProvider(provider, getFallbackChain(provider.name))
      agentAssignments.set(cacheKey, pWithFallback)
      return withRoleStats(pWithFallback, role)
    }
    // If the provider doesn't exist or isn't configured, fall through to primary
    console.warn(
      chalk.yellow(
        `[router] Warning: agent '${agentName}' requested provider '${overrideName}' but it is not configured. Falling back to primary.`
      )
    )
  }

  if (role === 'primary') return withRoleStats(assignment.primary, role)
  if (role === 'synthesis') return withRoleStats(assignment.synthesis, role)
  return withRoleStats(assignment.triage, role)
}

export interface FallbackStats {
  primary: { total: number; fallbacks: number }
  synthesis: { total: number; fallbacks: number }
  triage: { total: number; fallbacks: number }
}

export function getFallbackStats(): FallbackStats | null {
  if (!assignment) return null
  const p = assignment.primary
  const s = assignment.synthesis
  const t = assignment.triage
  return {
    primary: p instanceof FallbackProvider ? p.getRoleStats('primary') : { total: 0, fallbacks: 0 },
    synthesis:
      s instanceof FallbackProvider ? s.getRoleStats('synthesis') : { total: 0, fallbacks: 0 },
    triage: t instanceof FallbackProvider ? t.getRoleStats('triage') : { total: 0, fallbacks: 0 },
  }
}
