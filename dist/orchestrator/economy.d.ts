import type { IAgent } from '../agents/base.js';
export declare function applyEconomyRouting(agents: IAgent[], economyMode: boolean): IAgent[];
export declare function applyEconomyLimits(usingCombinedAnalyzer: boolean, softTokenLimit?: number, hardChunkLimit?: number): {
    softTokenLimit?: number;
    hardChunkLimit?: number;
};
