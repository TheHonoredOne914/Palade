import { type AgentName, BaseSpecialistAgent } from '../base.js';
export declare const ARCHITECTURE_WARNING = "CRITICAL CONTEXT WARNING: You are reviewing PARTIAL chunks of a codebase, not the entire program. Do NOT assert a \"circular dependency\" or \"layer violation\" spans multiple files unless you can see both sides of it in the chunks provided, or it is confirmed by the DEPENDENCY CYCLES section of REPOSITORY CONTEXT. Only flag LOCALLY visible coupling/boundary issues.";
export declare const ARCHITECTURE_FOCUS = "Additional architecture focus:\n- Circular dependencies, layer violations (e.g. UI code in business logic)\n- Tight coupling between unrelated modules, missing abstraction boundaries\n- God objects, inconsistent module boundaries, missing dependency injection\n- Consult the DEPENDENCY CYCLES section of REPOSITORY CONTEXT: each cycle listed there is a confirmed cross-file defect \u2014 report each one.";
export declare class ArchitectureAgent extends BaseSpecialistAgent {
    name: AgentName;
    protected getSystemPrompt(): string;
}
