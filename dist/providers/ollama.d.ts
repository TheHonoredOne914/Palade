import type { CompletionRequest, CompletionResponse, IProvider } from './base.js';
export default class OllamaProvider implements IProvider {
    name: string;
    model: string;
    private baseUrl;
    private readonly deadlineMs;
    private readonly limiter;
    private dead;
    constructor(model?: string, baseUrl?: string, maxConcurrency?: number, deadlineMs?: number);
    complete(req: CompletionRequest): Promise<CompletionResponse>;
    private doComplete;
    markDead(): void;
    isDead(): boolean;
    isDeadFromAuth(): boolean;
    isAvailable(): Promise<boolean>;
}
