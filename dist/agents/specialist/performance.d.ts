import { type AgentName, BaseSpecialistAgent } from '../base.js';
export declare const PERFORMANCE_WARNING = "CRITICAL CONTEXT WARNING: You are reviewing PARTIAL chunks of a codebase, not the entire program. Do NOT claim caching/pagination is \"missing across the app\" or that a collection grows \"unbounded\" unless you can see its full lifecycle in the chunks provided, or it is surfaced via the MODULE-LEVEL COLLECTIONS section of REPOSITORY CONTEXT. Only flag LOCALLY visible performance issues.";
export declare const PERFORMANCE_FOCUS = "Additional performance focus:\n- N+1 query patterns, synchronous operations inside async loops\n- Missing caching on expensive operations, unbounded result sets (no pagination/limit)\n- Memory leaks (event listeners not removed, unclosed streams)\n- Synchronous file I/O in request handlers\n- Trace variable lifetimes across callback boundaries to catch obscure asymptotic issues.\n- Consult the MODULE-LEVEL COLLECTIONS section of REPOSITORY CONTEXT: investigate each entry without delete/clear as an unbounded-growth candidate.";
export declare class PerformanceAgent extends BaseSpecialistAgent {
    name: AgentName;
    protected getSystemPrompt(): string;
}
