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
    // Claim and advance the index synchronously, before any `await`, so
    // concurrent calls each observe a distinct startIdx instead of racing on
    // the same stale `this.index` and piling onto the same provider.
    const startIdx = this.index
    this.index = (startIdx + 1) % n
    for (let offset = 0; offset < n; offset++) {
      const idx = (startIdx + offset) % n
      const provider = this.providers[idx]
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

  // Delegate to every member so the pool's own isAvailable()/isDead()
  // aggregation reflects the mark — this is normally only called once every
  // member is already unavailable (see router.ts's stillAvailable check),
  // but keeps the pool consistent with the shared-instance dead-tracking
  // used by every other IProvider implementation.
  markDead(): void {
    for (const p of this.providers) p.markDead?.()
  }

  // Dead only once every member is dead — a pool with any healthy key left
  // must still be tried.
  isDead(): boolean {
    return this.providers.every((p) => p.isDead?.() ?? false)
  }
}
