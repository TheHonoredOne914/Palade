import type { AgentContext } from '../agents/base.js';
import type { ScopeOptions } from '../ingestion/types.js';
import type { SwarmResult, SwarmOptions, ResolvedTarget } from './types.js';
import type { PaladeConfig } from '../config/schema.js';
export interface PipelineOptions {
    projectRoot: string;
    scope: ScopeOptions;
    context: AgentContext;
    swarmOptions?: SwarmOptions;
    target?: ResolvedTarget;
    dryRunConfig?: PaladeConfig;
}
export declare function contextBlockKey(header: string): string;
export declare function mergeContexts(retrieved: string, keyword: string): string;
export declare function runPipeline(opts: PipelineOptions): Promise<SwarmResult>;
