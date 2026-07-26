export declare class PaladeConfigError extends Error {
    field: string;
    suggestion?: string | undefined;
    constructor(message: string, field: string, suggestion?: string | undefined);
}
export declare class WorkspaceTooLargeError extends Error {
    limit: number;
    constructor(limit: number);
}
export declare class NoProvidersError extends Error {
    constructor();
}
export declare class OllamaNotRunningError extends Error {
    constructor();
}
export declare class SwarmTimeoutError extends Error {
    completedAgents: number;
    totalAgents: number;
    timeoutMs: number;
    constructor(completedAgents: number, totalAgents: number, timeoutMs: number);
}
export declare class TargetNotFoundError extends Error {
    constructor(name: string, available: string[]);
}
/**
 * Signals that a command wants the CLI process to exit with a specific code.
 * Command modules THROW this instead of calling process.exit() directly, so the
 * same command can run inside the TUI (where the host process must survive) and
 * the classic CLI (where the entry layer translates it into a real exit).
 */
export declare class CliExitError extends Error {
    exitCode: number;
    constructor(exitCode: number, message?: string);
}
/**
 * Thrown when a review run is stopped by a user-initiated abort (e.g. Ctrl+C
 * in the TUI) rather than by a provider error. Distinguishing this from
 * ordinary agent failures lets the caller skip scoring/report generation
 * instead of writing a report built from whatever partial findings happened
 * to exist when the cancellation landed.
 */
export declare class ReviewCancelledError extends Error {
    constructor();
}
export declare class AuthError extends Error {
    status: number;
    providerName: string;
    constructor(message: string, status: number, providerName: string);
}
