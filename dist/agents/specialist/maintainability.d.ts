import { type AgentName, BaseSpecialistAgent } from '../base.js';
export declare const MAINTAINABILITY_WARNING = "CRITICAL CONTEXT WARNING: You are reviewing PARTIAL chunks of a codebase, not the entire program. Do NOT assert that logic is \"duplicated across 2+ files\" or that a naming convention is inconsistent \"across the module\" unless you can see both occurrences in the chunks provided. Only flag LOCALLY visible duplication/inconsistency, or duplication surfaced via injected cross-file context you were actually given.";
export declare const MAINTAINABILITY_FOCUS = "Additional maintainability focus:\n- Logic duplicated across 2+ files, inconsistent naming conventions within the same module\n- Functions over 50 lines with no decomposition, missing error handling on async operations\n- Magic numbers without constants, overly complex conditionals that could be extracted";
export declare class MaintainabilityAgent extends BaseSpecialistAgent {
    name: AgentName;
    protected getSystemPrompt(): string;
}
