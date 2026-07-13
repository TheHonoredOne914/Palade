import type { IProvider, CompletionRequest, CompletionResponse } from './base.js'

// Attached to errors thrown by ProviderPool.complete() so callers (router.ts)
// can scope dead-marking to the exact member instance that threw, instead of
// calling markDead() on the pool wrapper itself — which would mark every
// member dead and silently disable healthy sibling keys over one bad key's
// fatal error.
export const PROVIDER_POOL_SOURCE = Symbol('providerPoolSource')

export type PoolSourceTaggedError = Error & { [PROVIDER_POOL_SOURCE]?: IProvider }

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
    // can classify it (at this point the pool genuinely is exhausted). Index
    // was already advanced above before the availability loop.
    const provider = candidate ?? this.providers[startIdx % n]
    try {
      return await provider.complete(req)
    } catch (err) {
      // Tag the error with the specific member instance that threw, so the
      // caller can mark only that member dead instead of calling
      // markDead()/isDead() on this pool wrapper (which would affect every
      // member). Stashing it on the error itself — rather than an instance
      // field like `this.lastHandler` — avoids a race where a concurrent
      // call overwrites the "last handler" before this one's catch runs.
      if (err instanceof Error) {
        ;(err as PoolSourceTaggedError)[PROVIDER_POOL_SOURCE] = provider
      }
      throw err
    }
  }

  async isAvailable(): Promise<boolean> {
    const results = await Promise.all(this.providers.map((p) => p.isAvailable()))
    return results.some((r) => r)
  }

  // Intentional no-op. Marking every member dead in one call would take down
  // every healthy sibling key over a single bad key's fatal error — the
  // opposite of the scoped, per-key dead-marking this pool exists to support.
  // Callers should mark the specific responsible member dead instead, via the
  // PROVIDER_POOL_SOURCE-tagged error from complete() (see router.ts's
  // markResponsibleProviderDead, which already prefers that scoped path over
  // calling markDead() on the pool wrapper itself). Kept as a no-op rather
  // than removed to satisfy the optional IProvider#markDead contract for any
  // caller that reaches this instance directly.
  markDead(): void {
    // no-op — see comment above
  }

  // Dead only once every member is dead — a pool with any healthy key left
  // must still be tried.
  isDead(): boolean {
    return this.providers.every((p) => p.isDead?.() ?? false)
  }

  // True only when EVERY member is dead specifically from an auth error —
  // mirrors isDead()'s "every" semantics but for the auth-specific signal
  // (providers-005).
  isDeadFromAuth(): boolean {
    return this.providers.every((p) => p.isDeadFromAuth?.() ?? false)
  }
}
