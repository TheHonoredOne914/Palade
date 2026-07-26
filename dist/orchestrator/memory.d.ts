import type { AgentFinding, AgentName } from '../agents/base.js';
import type { CrossAgentFinding } from './types.js';
export declare class AgentMemory {
    private store;
    record(agentName: AgentName, findings: AgentFinding[]): void;
    getAll(): AgentFinding[];
    crossReference(): CrossAgentFinding[];
}
