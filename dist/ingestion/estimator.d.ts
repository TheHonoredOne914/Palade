import type { CodeChunk } from './types.js';
import type { PaladeConfig } from '../config/schema.js';
export interface EstimateResult {
    totalChunks: number;
    totalInputTokens: number;
    agentCount: number;
    totalAgentInvocations: number;
    estimatedOutputTokens: number;
    estimatedTotalTokens: number;
    estimatedCostUsd: Record<string, number | null>;
    warningLevel: 'low' | 'medium' | 'high';
}
export declare function estimateRunCost(chunks: CodeChunk[], config: PaladeConfig, customAgentCount?: number): EstimateResult;
