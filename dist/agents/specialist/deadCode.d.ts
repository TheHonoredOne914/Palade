import { type AgentName, BaseSpecialistAgent } from '../base.js';
export declare const DEAD_CODE_WARNING = "CRITICAL CONTEXT WARNING: You are reviewing PARTIAL chunks of a codebase, not the entire program. Do NOT flag exported functions or classes as \"unused\" just because you don't see them imported in the current chunk. Only flag LOCALLY dead code (e.g. unreachable branches, variables assigned but never read within the same scope, or private methods never called).";
export declare const DEAD_CODE_FOCUS = "Additional dead code focus:\n- Exported functions/classes never imported elsewhere\n- Routes defined but never reached from frontend\n- Fully implemented classes never instantiated\n- Commented-out code blocks older than the surrounding context\n- Feature flags that are always false, imports that are unused\n- Before marking an export as unused:\n  1. Check if it appears in any re-export statement in the file\n  2. Consult the PUBLIC API FILES section of REPOSITORY CONTEXT \u2014 if the file appears there, its exports are consumed by library users\n  3. If PROJECT TYPE in REPOSITORY CONTEXT is library, assume unused-looking exports are consumed externally\n  4. If unsure, assume it's used by library consumers";
export declare class DeadCodeAgent extends BaseSpecialistAgent {
    name: AgentName;
    protected getSystemPrompt(): string;
}
