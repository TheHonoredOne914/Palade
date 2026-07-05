import chalk from 'chalk'
import type { PaladeConfig } from '../config/schema.js'
import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { GroqProvider } from './groq.js'
import { CerebrasProvider } from './cerebras.js'
import { NoProvidersError } from '../errors/types.js'
import { NvidiaProvider } from './nvidia.js'
import { OpenRouterProvider } from './openrouter.js'
import { OpenCodeZenProvider } from './opencode-zen.js'
import OllamaProvider from './ollama.js'
import { ProviderPool } from './pool.js'
import { withExponentialBackoff } from './backoff.js'

export class AllProvidersExhaustedError extends Error {
  constructor(public readonly attempts: { provider: string; finalError: string }[]) {
    super(`All ${attempts.length} providers failed. See .attempts for details.`)
    this.name = 'AllProvidersExhaustedError'
  }
}

// Single source of truth for error classification, shared by the inner
// withExponentialBackoff() call and the outer catch below — previously these
// kept two independently-maintained keyword lists that had drifted apart.
const RETRYABLE_KEYWORDS = [
  '429',
  '500',
  '502',
  '503',
  'timeout',
  'timed out',
  'econnrefused',
  'fetch failed',
  'rate limit',
]

// Bare 'daily' / 'quota' used to be fatal keywords, which meant an incidental
// occurrence of either word in an unrelated error body (or in the now-removed
// 'daily limit' / 'quota exhausted' RETRYABLE_KEYWORDS entries above) would
// permanently mark a provider dead. Tightened to the specific phrases our
// adapters actually throw (see groq.ts/cerebras.ts/nvidia.ts/openrouter.ts/
// opencode-zen.ts daily-limit messages) so a stray 'daily' or 'quota'
// substring elsewhere in a body can't trip this.
const FATAL_KEYWORDS = [
  'per day',
  'per-day',
  'daily limit',
  'quota exceeded',
  'out of quota',
  'insufficient_quota',
  'monthly limit',
]

function isRetryableMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return RETRYABLE_KEYWORDS.some((keyword) => lower.includes(keyword))
}

function isFatalMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return FATAL_KEYWORDS.some((keyword) => lower.includes(keyword))
}

export type ProviderRole = 'primary' | 'synthesis'

export interface ProviderAssignment {
  primary: IProvider
  synthesis: IProvider
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
          new NvidiaProvider(key, cfg.model, cfg.baseUrl, cfg.maxConcurrency, cfg.timeoutMs)
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
        instances.push(new OllamaProvider(cfg.model, cfg.baseUrl, cfg.maxConcurrency))
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

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length)
}

let assignment: ProviderAssignment | null = null
let allProviders: Map<string, IProvider> = new Map()

export class FallbackProvider implements IProvider {
  private chain: IProvider[]
  private _fallbackCount = 0
  private _totalCount = 0
  private deadProviders = new Set<string>()

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

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    // Try primary provider first, fall back on error
    this._totalCount++

    let lastError: Error | undefined
    let primaryProvider = this.chain[0]

    const attempts: { provider: string; finalError: string }[] = []

    for (let i = 0; i < this.chain.length; i++) {
      const provider = this.chain[i]

      if (this.deadProviders.has(provider.name)) {
        attempts.push({
          provider: provider.name,
          finalError: 'skipped — marked dead earlier this session (hard quota limit)',
        })
        continue
      }

      try {
        const response = await withExponentialBackoff(() => provider.complete(req), {
          maxRetries: 2,
          baseDelayMs: 1000,
          maxDelayMs: 15000,
          retryableErrors: RETRYABLE_KEYWORDS,
          fatalErrors: FATAL_KEYWORDS,
          signal: req.signal,
        })

        if (provider !== primaryProvider) {
          this._fallbackCount++
          return { ...response, provider: provider.name, model: provider.model }
        }
        return response
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        attempts.push({ provider: provider.name, finalError: lastError.message })

        const isFatal = isFatalMessage(lastError.message)
        const isRetryable = isRetryableMessage(lastError.message)

        if (isFatal) {
          this.deadProviders.add(provider.name)
          console.warn(
            chalk.red(`[router] provider ${provider.name} marked as DEAD (hard quota limit)`)
          )
        }

        // Default to trying the next provider even for errors that match
        // neither the retryable nor fatal keyword lists — an unclassified
        // error on this provider (e.g. a bad key) doesn't mean every other
        // provider in the chain will fail the same way, so give them a
        // chance before giving up entirely.
        if (i < this.chain.length - 1) {
          const reason = isRetryable ? 'exhausted retries' : 'hit an unclassified error'
          console.warn(chalk.yellow(`[router] provider ${provider.name} ${reason}, trying next`))
        }
        continue
      }
    }

    throw new AllProvidersExhaustedError(attempts)
  }

  async isAvailable(): Promise<boolean> {
    return this.chain[0].isAvailable()
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

  const result: ProviderAssignment = {
    primary: primaryWithFallback,
    synthesis: synthesisWithFallback,
  }
  assignment = result

  return result
}

export function getProvider(role: ProviderRole): IProvider {
  if (!assignment) {
    throw new Error('Router not initialized. Call initRouter() first.')
  }
  return role === 'primary' ? assignment.primary : assignment.synthesis
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
