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
    const provider = this.providers[this.index % this.providers.length]
    this.index = (this.index + 1) % this.providers.length
    return provider.complete(req)
  }

  async isAvailable(): Promise<boolean> {
    const results = await Promise.all(
      this.providers.map((p) => p.isAvailable())
    )
    return results.some((r) => r)
  }
}
