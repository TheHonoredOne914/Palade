import { OpenAICompatibleProvider } from './openaiCompatible.js';
export declare class OpenRouterProvider extends OpenAICompatibleProvider {
    constructor(apiKey: string, model?: string, maxConcurrency?: number, baseUrl?: string, deadlineMs?: number, referer?: string, title?: string);
}
