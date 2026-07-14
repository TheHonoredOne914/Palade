import { type AgentName, BaseSpecialistAgent } from '../base.js'

// Exported so economy mode's combined prompt (combined.ts) can reuse the
// exact same partial-chunk warning text instead of a hand-paraphrased summary
// that can drift from what this agent actually says, mirroring deadCode.ts's
// DEAD_CODE_WARNING / testIntelligence.ts's TEST_INTELLIGENCE_WARNING /
// maintainability.ts's MAINTAINABILITY_WARNING (agents-102).
export const PERFORMANCE_WARNING = `CRITICAL CONTEXT WARNING: You are reviewing PARTIAL chunks of a codebase, not the entire program. Do NOT claim caching/pagination is "missing across the app" or that a collection grows "unbounded" unless you can see its full lifecycle in the chunks provided, or it is surfaced via the MODULE-LEVEL COLLECTIONS section of REPOSITORY CONTEXT. Only flag LOCALLY visible performance issues.`

// Exported so economy mode's combined prompt (combined.ts) can reuse the
// exact same domain-focus text instead of a second hand-written copy
// (agents-001).
export const PERFORMANCE_FOCUS = `Additional performance focus:
- N+1 query patterns, synchronous operations inside async loops
- Missing caching on expensive operations, unbounded result sets (no pagination/limit)
- Memory leaks (event listeners not removed, unclosed streams)
- Synchronous file I/O in request handlers
- Trace variable lifetimes across callback boundaries to catch obscure asymptotic issues.
- Consult the MODULE-LEVEL COLLECTIONS section of REPOSITORY CONTEXT: investigate each entry without delete/clear as an unbounded-growth candidate.`

const SYSTEM_PROMPT = `You are a specialist performance code reviewer. You are part of a parallel AI swarm analyzing a codebase.

Your job: identify performance issues in the code provided.

${PERFORMANCE_WARNING}

Before outputting any JSON, you MUST write a <thinking> block to trace data flow, analyze edge cases, and justify your logic. 
At the end of your <thinking> block, perform a Self-Critique: ask yourself if there are any conditions where the code is actually safe or if you might be hallucinating. If the code is safe, drop the finding.

After your <thinking> block, return ONLY a valid JSON array of findings. No other text.

Each finding must match this exact schema:
{
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "title": "Short title, max 10 words",
  "description": "2-4 sentences. Be specific. Explain the risk or problem clearly.",
  "filePath": "relative/path/to/file.ts",
  "lineStart": 42,
  "lineEnd": 67,
  "symbolName": "functionName (optional)",
  "tags": ["tag1", "tag2"]
}

Example output:
[
  {
    "severity": "high",
    "title": "N+1 query fetching order items in a loop",
    "description": "listOrders fetches all orders, then calls getItemsForOrder(order.id) inside a for-loop for each one, issuing one database round-trip per order. Batch-load items with a single query using an IN clause instead.",
    "filePath": "src/services/orderService.ts",
    "lineStart": 40,
    "lineEnd": 47,
    "symbolName": "listOrders",
    "tags": ["performance", "n+1"]
  }
]

If you find no issues: return an empty array [].
Do not invent file paths. Only reference files shown in the context.
Be specific. Reference exact file paths and line numbers from the context provided.

${PERFORMANCE_FOCUS}`

export class PerformanceAgent extends BaseSpecialistAgent {
  name: AgentName = 'performance'

  protected getSystemPrompt(): string {
    return SYSTEM_PROMPT
  }
}
