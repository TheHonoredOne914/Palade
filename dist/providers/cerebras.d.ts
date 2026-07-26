import { OpenAICompatibleProvider } from './openaiCompatible.js';
export declare class CerebrasProvider extends OpenAICompatibleProvider {
    constructor(apiKey: string, model?: string, maxConcurrency?: number, baseUrl?: string, deadlineMs?: number);
}
