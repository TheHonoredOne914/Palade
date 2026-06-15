export class PaladeConfigError extends Error {
  constructor(
    message: string,
    public field: string,
    public suggestion?: string
  ) {
    super(message)
    this.name = 'PaladeConfigError'
  }
}

export class NoProvidersError extends Error {
  constructor() {
    super('No LLM providers available. Set at least one API key:\n  GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, NVIDIA_API_KEY, or OPENCODE_ZEN_API_KEY')
    this.name = 'NoProvidersError'
  }
}

export class ProviderRateLimitError extends Error {
  constructor(
    public provider: string,
    public retryAfterMs: number
  ) {
    super(`${provider} rate limit exceeded. Retry after ${retryAfterMs}ms.`)
    this.name = 'ProviderRateLimitError'
  }
}

export class SwarmTimeoutError extends Error {
  constructor(
    public completedAgents: number,
    public totalAgents: number,
    public timeoutMs: number
  ) {
    super(`Swarm timed out after ${timeoutMs}ms. ${completedAgents}/${totalAgents} agents completed.`)
    this.name = 'SwarmTimeoutError'
  }
}

export class TargetNotFoundError extends Error {
  constructor(name: string, available: string[]) {
    super(
      `Target '${name}' not found. Available targets: ${available.length > 0 ? available.join(', ') : '(none defined)'}`
    )
    this.name = 'TargetNotFoundError'
  }
}

export class IngestionError extends Error {
  constructor(filePath: string, cause: Error) {
    super(`Failed to process ${filePath}: ${cause.message}`)
    this.name = 'IngestionError'
    this.cause = cause
  }
}
