export declare const PROVIDERS: readonly [{
    readonly id: "groq";
    readonly label: "Groq";
    readonly env: "GROQ_API_KEY";
    readonly model: "openai/gpt-oss-120b";
}, {
    readonly id: "cerebras";
    readonly label: "Cerebras";
    readonly env: "CEREBRAS_API_KEY";
    readonly model: "gpt-oss-120b";
}, {
    readonly id: "openrouter";
    readonly label: "OpenRouter";
    readonly env: "OPENROUTER_API_KEY";
    readonly model: "openrouter/free";
}, {
    readonly id: "nvidia";
    readonly label: "NVIDIA";
    readonly env: "NVIDIA_API_KEY";
    readonly model: "minimaxai/minimax-m3";
}, {
    readonly id: "opencode-zen";
    readonly label: "OpenCode Zen";
    readonly env: "OPENCODE_ZEN_API_KEY";
    readonly model: "deepseek-v4-flash-free";
}, {
    readonly id: "ollama";
    readonly label: "Ollama";
    readonly env: "OLLAMA_BASE_URL";
    readonly model: "minimax-m2.5";
}];
export type ProviderId = (typeof PROVIDERS)[number]['id'];
/**
 * Whether a provider has enough configuration to be considered "available"
 * in status displays (TUI provider dots, settings panel tabs). Every
 * provider except ollama needs a non-empty apiKey; ollama is keyless, so its
 * own config section merely being present counts — matches router.ts's
 * instantiateProviders() usable check (uicli-002/003).
 */
export declare function isProviderConfigured(providers: Record<string, {
    apiKey?: string;
} | undefined> | undefined, id: ProviderId): boolean;
/**
 * Same precedence as config/loader.ts loadConfig(): `.palade/palade.config.ts`
 * first, then the root-level file. Writing to a different file than the one
 * loadConfig reads would save keys that are never picked up.
 */
export declare function resolveConfigPath(projectRoot: string): string;
export declare function setNestedValue(content: string, dotPath: string, value: unknown): string;
/**
 * Persists a single dotted-path config value (e.g. "swarm.primary",
 * "providers.groq.model") to the resolved palade.config.ts. Used by the TUI
 * settings panel's swarm/synthesis/model selectors — same underlying writer
 * as `palade settings --set`.
 */
export declare function saveConfigValues(projectRoot: string, updates: Record<string, unknown>): Promise<void>;
export declare function saveConfigValue(projectRoot: string, dotPath: string, value: unknown): Promise<void>;
export declare function readCurrentKeys(projectRoot: string): Promise<Record<string, string>>;
/**
 * Single source of truth for "save an API key" — now only writes to .env
 * to prevent leaking secrets into version control.
 */
export declare function saveApiKey(projectRoot: string, providerId: ProviderId, apiKey: string): Promise<void>;
