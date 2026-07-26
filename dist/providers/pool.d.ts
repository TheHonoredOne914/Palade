import type { IProvider, CompletionRequest, CompletionResponse } from './base.js';
export declare const PROVIDER_POOL_SOURCE: unique symbol;
export type PoolSourceTaggedError = Error & {
    [PROVIDER_POOL_SOURCE]?: IProvider;
};
export declare class ProviderPool implements IProvider {
    readonly name: string;
    readonly model: string;
    private providers;
    private index;
    constructor(name: string, providers: IProvider[]);
    complete(req: CompletionRequest): Promise<CompletionResponse>;
    isAvailable(): Promise<boolean>;
    markDead(): void;
    isDead(): boolean;
    isDeadFromAuth(): boolean;
}
