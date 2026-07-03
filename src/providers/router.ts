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
}

function createProviderInstances(name: string, cfg: ProviderConfig): IProvider[] {
  const allKeys = cfg.apiKeys ?? [cfg.apiKey]
  const instances: IProvider[] = []

  for (const key of allKeys) {
    switch (name) {
      case 'groq':
        instances.push(new GroqProvider(key, cfg.model, cfg.maxConcurrency))
        break
      case 'cerebras':
        instances.push(new CerebrasProvider(key, cfg.model, cfg.maxConcurrency))
        break
      case 'nvidia':
        instances.push(new NvidiaProvider(key, cfg.model, cfg.baseUrl))
        break
      case 'openrouter':
        instances.push(new OpenRouterProvider(key, cfg.model))
        break
      case 'opencode-zen':
        instances.push(new OpenCodeZenProvider(key, cfg.model))
        break
      case 'ollama':
        instances.push(new OllamaProvider(cfg.model, cfg.baseUrl))
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
          retryableErrors: [
            '429',
            '500',
            '502',
            '503',
            'timeout',
            'timed out',
            'ECONNREFUSED',
            'fetch failed',
          ],
          fatalErrors: [
            'per day',
            'per-day',
            'daily',
            'quota',
            'insufficient_quota',
            'monthly limit',
          ],
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

        const isRetryable = [
          '429',
          '500',
          '502',
          '503',
          'timeout',
          'timed out',
          'econnrefused',
          'fetch failed',
          'rate limit',
          'daily limit',
          'quota exhausted',
        ].some((msg) => lastError!.message.toLowerCase().includes(msg))

        const isFatal = [
          'per day',
          'per-day',
          'daily',
          'quota',
          'insufficient_quota',
          'monthly limit',
        ].some((msg) => lastError!.message.toLowerCase().includes(msg))

        if (isFatal) {
          this.deadProviders.add(provider.name)
          console.warn(
            chalk.red(`[router] provider ${provider.name} marked as DEAD (hard quota limit)`)
          )
        }

        if (isRetryable || isFatal) {
          if (i < this.chain.length - 1) {
            console.warn(
              chalk.yellow(`[router] provider ${provider.name} exhausted retries, trying next`)
            )
          }
          continue
        }
        throw lastError
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
