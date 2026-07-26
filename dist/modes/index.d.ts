import type { AgentName } from '../agents/base.js';
import type { ReviewMode } from '../agents/base.js';
export interface ModeConfig {
    mode: ReviewMode;
    agentOverrides?: AgentName[];
    systemPromptSuffix: string;
    synthesisPromptSuffix: string;
    outputOverride?: string;
}
export declare function getModeConfig(mode: ReviewMode): ModeConfig;
export declare function validateMode(raw: string): ReviewMode;
