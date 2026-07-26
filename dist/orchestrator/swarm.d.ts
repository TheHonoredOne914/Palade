import type { AgentContext } from '../agents/base.js';
import type { CodeChunk, FileManifest } from '../ingestion/types.js';
import type { SwarmResult, SwarmOptions } from './types.js';
export declare function runSwarm(allChunks: CodeChunk[], context: AgentContext, options?: SwarmOptions, manifests?: FileManifest[]): Promise<SwarmResult>;
