import chalk from 'chalk'
import type { PaladeConfig } from '../config/schema.js'
import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { FATAL_QUOTA_KEYWORDS } from './base.js'
import { GroqProvider } from './groq.js'
import { CerebrasProvider } from './cerebras.js'
import { NoProvidersError, AuthError } from '../errors/types.js'
import { isFatalAuthError } from './errorClassification.js'
import { NvidiaProvider } from './nvidia.js'
import { OpenRouterProvider } from './openrouter.js'
import { OpenCodeZenProvider } from './opencode-zen.js'
import OllamaProvider from './ollama.js'
import { ProviderPool } from './pool.js'
import { sanitizeErrorMessage } from '../utils/sanitize.js'

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

function isFatalMessage(message: string): boolean {
  const lower = message.toLowerCase()
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
}

function createProviderInstances(name: string, cfg: ProviderConfig): IProvider[] {
  const allKeys = cfg.apiKeys ?? [cfg.apiKey]
  const instances: IProvider[] = []

  for (const key of allKeys) {
    switch (name) {
      case 'groq':
        instances.push(
          new GroqProvider(key, cfg.model, cfg.maxConcurrency, cfg.baseUrl, cfg.timeoutMs)
        )
        break
      case 'cerebras':
        instances.push(
          new CerebrasProvider(key, cfg.model, cfg.maxConcurrency, cfg.baseUrl, cfg.timeoutMs)
        )
        break
      case 'nvidia':
        instances.push(
          new NvidiaProvider(key, cfg.model, cfg.maxConcurrency, cfg.baseUrl, cfg.timeoutMs)
        )
        break
      case 'openrouter':
        instances.push(
          new OpenRouterProvider(key, cfg.model, cfg.maxConcurrency, cfg.baseUrl, cfg.timeoutMs)
        )
        break
      case 'opencode-zen':
        instances.push(
          new OpenCodeZenProvider(key, cfg.model, cfg.maxConcurrency, cfg.baseUrl, cfg.timeoutMs)
        )
        break
      case 'ollama':
        instances.push(
          new OllamaProvider(cfg.model, cfg.baseUrl, cfg.maxConcurrency, cfg.timeoutMs)
        )
        break
    }
  }

  return instances
}

function instantiateProviders(providers: PaladeConfig['providers']): Map<string, IProvider> {
  const map = new Map<string, IProvider>()

  for (const name of [
    'opencode-zen',
    'nvidia',
    'groq',
    'cerebras',
    'openrouter',
    'ollama',
  ] as const) {
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

  /** Number of calls that fell back to a non-primary provider. */
  get fallbackCount() { return this._fallbackCount }
  /** Total calls attempted. */
  get totalCount() { return this._totalCount }

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
        attempts.push({ provider: provider.name, finalError: lastError.message })
        attemptedAny = true

        const isFatal = isFatalMessage(lastError.message)
        if (isFatalAuthError(lastError)) {
          lastAuthLikeError = lastError
        } else {
          allAttemptsAuthLike = false
        }

        if (isFatal) {
          // A chain entry may be a ProviderPool backing several keys/instances
          // that share this same provider name. A fatal error on ONE member
          // (e.g. that key's daily quota) must not take down its healthy
          // siblings, so defer to the entry's own isAvailable() — which for a
          // pool aggregates per-member state — rather than blanket-marking the
          // shared name dead on any fatal-looking error.
          const stillAvailable = await provider.isAvailable()
          if (stillAvailable) {
            console.warn(
              chalk.yellow(
                `[router] provider ${provider.name} hit a fatal-looking error on one instance, but other instances remain available — not marking the whole provider dead`
              )
            )
          } else {
            provider.markDead?.()
            console.warn(
              chalk.red(`[router] provider ${provider.name} marked as DEAD (hard quota limit)`)
            )
          }
        } else if (isFatalAuthError(lastError)) {
          // A 401/403 means the key itself is invalid — unlike the quota case
          // above, isAvailable() is a quota-only check and can never detect
          // this, so gating on "stillAvailable" would never mark the provider
          // dead and it would be retried as primary on every subsequent call
          // for the rest of the run. Mark it dead unconditionally instead.
          provider.markDead?.()
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

export function getProvider(role: ProviderRole): IProvider {
  if (!assignment) {
    throw new Error('Router not initialized. Call initRouter() first.')
  }
  if (role === 'primary') return assignment.primary
  if (role === 'synthesis') return assignment.synthesis
  return assignment.triage
}

export interface FallbackStats {
  primary: { total: number; fallbacks: number }
  synthesis: { total: number; fallbacks: number }
}

export function getFallbackStats(): FallbackStats | null {
  if (!assignment) return null
  const p = assignment.primary
  const s = assignment.synthesis
  return {
    primary: {
      total: p instanceof FallbackProvider ? p.totalCount : 0,
      fallbacks: p instanceof FallbackProvider ? p.fallbackCount : 0,
    },
    synthesis: {
      total: s instanceof FallbackProvider ? s.totalCount : 0,
      fallbacks: s instanceof FallbackProvider ? s.fallbackCount : 0,
    },
  }
}

export interface FallbackStats {
  primary: { total: number; fallbacks: number }
  synthesis: { total: number; fallbacks: number }
}

export function getFallbackStats(): FallbackStats | null {
  if (!assignment) return null
  const p = assignment.primary
  const s = assignment.synthesis
  return {
    primary: {
      total: p instanceof FallbackProvider ? p.totalCount : 0,
      fallbacks: p instanceof FallbackProvider ? p.fallbackCount : 0,
    },
    synthesis: {
      total: s instanceof FallbackProvider ? s.totalCount : 0,
      fallbacks: s instanceof FallbackProvider ? s.fallbackCount : 0,
    },
  }
}
