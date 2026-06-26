import chalk from 'chalk'
import type { PaladeConfig } from '../config/schema.js'
import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'
import { GroqProvider } from './groq.js'
import { CerebrasProvider } from './cerebras.js'
import { NoProvidersError } from '../errors/types.js'
import { NvidiaProvider } from './nvidia.js'
import { OpenRouterProvider } from './openrouter.js'
import { OpenCodeZenProvider } from './opencode-zen.js'
import { ProviderPool } from './pool.js'

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
        instances.push(new CerebrasProvider(key, cfg.model))
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
    }
  }

  return instances
}

function instantiateProviders(
  providers: PaladeConfig['providers']
): Map<string, IProvider> {
  const map = new Map<string, IProvider>()

  for (const name of ['opencode-zen', 'nvidia', 'groq', 'cerebras', 'openrouter'] as const) {
    const cfg = providers[name]
    if (cfg && 'apiKey' in cfg && cfg.apiKey) {
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
  private index = 0
  private _fallbackCount = 0
  private _totalCount = 0

  constructor(primary: IProvider, fallbacks: IProvider[]) {
    this.chain = [primary, ...fallbacks]
  }

  get name() { return this.chain[0].name }
  get model() { return this.chain[0].model }

  /** Number of calls that fell back to a non-primary provider. */
  get fallbackCount() { return this._fallbackCount }
  /** Total calls attempted. */
  get totalCount() { return this._totalCount }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    // Try each provider in round-robin, fall back on any error
    const startIndex = this.index % this.chain.length
    this.index++
    this._totalCount++

    let lastError: Error | undefined
    let primaryProvider = this.chain[0]

    for (let i = 0; i < this.chain.length; i++) {
      const providerIdx = (startIndex + i) % this.chain.length
      const provider = this.chain[providerIdx]

      try {
        const response = await provider.complete(req)
        // If a fallback answered, override the response identity so downstream
        // code (finding tagging, terminal reporter) can surface the degraded
        // source instead of silently claiming the primary answered.
        if (provider !== primaryProvider) {
          this._fallbackCount++
          return { ...response, provider: provider.name, model: provider.model }
        }
        return response
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const isRetryable =
          lastError.message.includes('429') ||
          lastError.message.includes('rate limit') ||
          lastError.message.includes('daily limit') ||
          lastError.message.includes('exhausted') ||
          lastError.message.includes('502') ||
          lastError.message.includes('503') ||
          lastError.message.includes('timed out') ||
          lastError.message.includes('timeout')

        if (isRetryable && i < this.chain.length - 1) {
          console.warn(
            chalk.yellow(`  ${provider.name} failed, trying ${this.chain[(providerIdx + 1) % this.chain.length].name}`)
          )
          continue
        }
        throw lastError
      }
    }

    throw lastError ?? new Error('All providers exhausted')
  }

  async isAvailable(): Promise<boolean> {
    return this.chain[0].isAvailable()
  }
}

function getFallbackChain(role: ProviderRole): IProvider[] {
  const primaryName = assignment?.[role]?.name
  const fallbacks: IProvider[] = []
  for (const [name, provider] of allProviders) {
    if (name !== primaryName) {
      fallbacks.push(provider)
    }
  }
  return fallbacks
}

export async function initRouter(config: PaladeConfig): Promise<ProviderAssignment> {
  allProviders = instantiateProviders(config.providers)

  const names = Array.from(allProviders.keys())
  const availability = await Promise.all(
    names.map((n) => allProviders.get(n)!.isAvailable())
  )

  if (names.length > 0) {
    console.log(chalk.bold('\nProviders:'))
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      const available = availability[i]
      const provider = allProviders.get(name)!
      const icon = available ? chalk.green('✓') : chalk.red('✗')
      const poolInfo = provider instanceof ProviderPool
        ? chalk.dim(` (${provider.size} keys)`)
        : ''
      const label = padRight(`  ${icon} ${provider.name}`, 25)
      const status = available
        ? chalk.green('available')
        : chalk.red(`unavailable — check ${name.toUpperCase().replace(/-/g, '_')}_API_KEY`)
      const modelInfo = available ? chalk.dim(` (${provider.model})`) : ''
      console.log(`${label} ${status}${modelInfo}${poolInfo}`)
    }
    console.log()
  }

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
  const primaryWithFallback = new FallbackProvider(primary, getFallbackChain('primary'))
  const synthesisWithFallback = new FallbackProvider(synthesis, getFallbackChain('synthesis'))

  const result: ProviderAssignment = {
    primary: primaryWithFallback,
    synthesis: synthesisWithFallback,
  }
  assignment = result

  const agentCount = config.swarm.agentCount
  const primaryLabel = primary.name
  const synthesisLabel = synthesis.name

  console.log(
    `Swarm:     ${chalk.cyan(primaryLabel)} → ${agentCount} agents ${chalk.dim(`(${primary.model})`)}`
  )
  console.log(
    `Synthesis: ${chalk.magenta(synthesisLabel)} ${chalk.dim(`(${synthesis.model})`)}`
  )
  console.log()

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
