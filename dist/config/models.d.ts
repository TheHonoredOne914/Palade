import type { ProviderId } from './apiKey.js';
export declare const PROVIDER_BASE_URLS: Record<Exclude<ProviderId, 'ollama'>, string>;
/**
 * Fetches the live model list for a provider so the settings panel can offer
 * a real selector instead of a hardcoded guess. Returns [] on any failure
 * (bad key, network, unexpected shape) — the caller falls back to manual
 * text entry rather than surfacing this as an error.
 */
export declare function fetchModels(providerId: ProviderId | 'ollama', apiKey: string, baseUrl?: string): Promise<string[]>;
