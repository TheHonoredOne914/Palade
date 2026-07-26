import type { IProvider, CompletionRequest, CompletionResponse } from './base.js';
interface OpenAIMessage {
    content?: string;
    reasoning_content?: string;
}
/**
 * Shared config for every OpenAI chat-completions-compatible adapter
 * (groq/cerebras/nvidia/openrouter/opencode-zen). These five adapters used to
 * each hand-copy an ~90-line doComplete() that differed only in the values
 * captured here — the retry/backoff/dead-marking/error-shape logic itself was
 * identical across all five and had started to drift (providers-003).
 */
export interface OpenAICompatibleConfig {
    /** Internal provider name — matches IProvider.name / router.ts's PROVIDER_NAMES entries. */
    name: string;
    /** Human-readable label used in error/log messages (e.g. 'NVIDIA', 'OpenCode Zen'). */
    label: string;
    defaultModel: string;
    defaultBaseUrl: string;
    defaultMaxConcurrency: number;
    /** max_tokens used for a call when the caller's CompletionRequest doesn't specify one. */
    defaultMaxTokens: number;
    /** Extra request headers beyond Authorization/Content-Type (openrouter's Referer/Title). */
    extraHeaders?: () => Record<string, string>;
    /**
     * Extracts the completion text from one choice's message. Defaults to
     * `.content`; opencode-zen overrides this to also fall back to
     * `.reasoning_content` for reasoning models that put the answer there
     * instead, leaving `.content` empty.
     */
    extractContent?: (message: OpenAIMessage | undefined) => string;
}
export declare class OpenAICompatibleProvider implements IProvider {
    readonly name: string;
    readonly model: string;
    private readonly label;
    private readonly apiKey;
    private readonly baseUrl;
    private readonly deadlineMs;
    private readonly limiter;
    private readonly requestDefaultMaxTokens;
    private readonly extraHeaders;
    private readonly extractContent;
    private dailyLimitExhausted;
    private deadGeneric;
    constructor(cfg: OpenAICompatibleConfig, apiKey: string, model?: string, maxConcurrency?: number, baseUrl?: string, deadlineMs?: number);
    complete(req: CompletionRequest): Promise<CompletionResponse>;
    private doComplete;
    markDead(): void;
    isDead(): boolean;
    isDeadFromAuth(): boolean;
    isAvailable(): Promise<boolean>;
}
export {};
