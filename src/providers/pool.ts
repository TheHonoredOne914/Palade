import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'

export class ProviderPool implements IProvider {
  readonly name: string
  readonly model: string
  private providers: IProvider[]
  private index = 0

  constructor(name: string, providers: IProvider[]) {
    if (providers.length === 0) {
      throw new Error(`ProviderPool '${name}' requires at least one provider`)
    }
    this.name = name
    this.model = providers[0].model
    this.providers = providers
  }

  get size(): number {
    return this.providers.length
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    // Round-robin, but skip members that report unavailable (e.g. a key whose
    // daily quota is exhausted). Otherwise one dead key throws a fatal-looking
    // error that gets the whole pool marked dead while healthy keys remain.
    const n = this.providers.length
    let candidate: IProvider | undefined
    // Snapshot the starting index atomically before any async yields, then
    // advance it — this prevents two concurrent complete() calls from picking
    // the same provider when they interleave at the `await provider.isAvailable()`.
    const startIdx = this.index
    this.index = (startIdx + n) % n // advance past all n candidates we'll try
    for (let offset = 0; offset < n; offset++) {
      const provider = this.providers[(startIdx + offset) % n]
      if (await provider.isAvailable()) {
        candidate = provider
        break
      }
    }
    // All members unavailable — let one produce the real error so the caller
    // can classify it (at this point the pool genuinely is exhausted).
    const provider = candidate ?? this.providers[startIdx % n]
    return provider.complete(req)
  }

  async isAvailable(): Promise<boolean> {
    const results = await Promise.all(this.providers.map((p) => p.isAvailable()))
    return results.some((r) => r)
  }
}
