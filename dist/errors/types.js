export class PaladeConfigError extends Error {
    field;
    suggestion;
    constructor(message, field, suggestion) {
        super(message);
        this.field = field;
        this.suggestion = suggestion;
        this.name = 'PaladeConfigError';
    }
}
export class WorkspaceTooLargeError extends Error {
    limit;
    constructor(limit) {
        super(`Workspace is too large to scan (>${limit} files).`);
        this.limit = limit;
        this.name = 'WorkspaceTooLargeError';
    }
}
export class NoProvidersError extends Error {
    constructor() {
        super('No LLM providers available. Set at least one API key:\n  GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, NVIDIA_API_KEY, or OPENCODE_ZEN_API_KEY');
        this.name = 'NoProvidersError';
    }
}
export class OllamaNotRunningError extends Error {
    constructor() {
        super('Ollama is not running. Start it with: ollama serve');
        this.name = 'OllamaNotRunningError';
    }
}
export class SwarmTimeoutError extends Error {
    completedAgents;
    totalAgents;
    timeoutMs;
    constructor(completedAgents, totalAgents, timeoutMs) {
        super(`Swarm timed out after ${timeoutMs}ms. ${completedAgents}/${totalAgents} agents completed.`);
        this.completedAgents = completedAgents;
        this.totalAgents = totalAgents;
        this.timeoutMs = timeoutMs;
        this.name = 'SwarmTimeoutError';
    }
}
export class TargetNotFoundError extends Error {
    constructor(name, available) {
        super(`Target '${name}' not found. Available targets: ${available.length > 0 ? available.join(', ') : '(none defined)'}`);
        this.name = 'TargetNotFoundError';
    }
}
/**
 * Signals that a command wants the CLI process to exit with a specific code.
 * Command modules THROW this instead of calling process.exit() directly, so the
 * same command can run inside the TUI (where the host process must survive) and
 * the classic CLI (where the entry layer translates it into a real exit).
 */
export class CliExitError extends Error {
    exitCode;
    constructor(exitCode, message) {
        super(message);
        this.exitCode = exitCode;
        this.name = 'CliExitError';
    }
}
/**
 * Thrown when a review run is stopped by a user-initiated abort (e.g. Ctrl+C
 * in the TUI) rather than by a provider error. Distinguishing this from
 * ordinary agent failures lets the caller skip scoring/report generation
 * instead of writing a report built from whatever partial findings happened
 * to exist when the cancellation landed.
 */
export class ReviewCancelledError extends Error {
    constructor() {
        super('Review cancelled');
        this.name = 'ReviewCancelledError';
    }
}
export class AuthError extends Error {
    status;
    providerName;
    constructor(message, status, providerName) {
        super(message);
        this.status = status;
        this.providerName = providerName;
        this.name = 'AuthError';
    }
}
