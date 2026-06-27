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
    super(
      'No LLM providers available. Set at least one API key:\n  GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, NVIDIA_API_KEY, or OPENCODE_ZEN_API_KEY'
    )
    this.name = 'NoProvidersError'
  }
}

export class OllamaNotRunningError extends Error {
  constructor() {
    super('Ollama is not running. Start it with: ollama serve')
    this.name = 'OllamaNotRunningError'
  }
}

export class SwarmTimeoutError extends Error {
  constructor(
    public completedAgents: number,
    public totalAgents: number,
    public timeoutMs: number
  ) {
    super(
      `Swarm timed out after ${timeoutMs}ms. ${completedAgents}/${totalAgents} agents completed.`
    )
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

/**
 * Signals that a command wants the CLI process to exit with a specific code.
 * Command modules THROW this instead of calling process.exit() directly, so the
 * same command can run inside the TUI (where the host process must survive) and
 * the classic CLI (where the entry layer translates it into a real exit).
 */
export class CliExitError extends Error {
  constructor(
    public exitCode: number,
    message?: string
  ) {
    super(message)
    this.name = 'CliExitError'
  }
}
