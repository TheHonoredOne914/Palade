import { type AgentName, BaseSpecialistAgent } from '../base.js'

// Exported so economy mode's combined prompt (combined.ts) can reuse the
// exact same partial-chunk warning + domain-focus text instead of a
// hand-paraphrased summary that can drift from what this agent actually says
// (agents-001).
export const DEAD_CODE_WARNING = `CRITICAL CONTEXT WARNING: You are reviewing PARTIAL chunks of a codebase, not the entire program. Do NOT flag exported functions or classes as "unused" just because you don't see them imported in the current chunk. Only flag LOCALLY dead code (e.g. unreachable branches, variables assigned but never read within the same scope, or private methods never called).`

export const DEAD_CODE_FOCUS = `Additional dead code focus:
- Exported functions/classes never imported elsewhere
- Routes defined but never reached from frontend
- Fully implemented classes never instantiated
- Commented-out code blocks older than the surrounding context
- Feature flags that are always false, imports that are unused
- Before marking an export as unused:
  1. Check if it appears in any re-export statement in the file
  2. Consult the PUBLIC API FILES section of REPOSITORY CONTEXT — if the file appears there, its exports are consumed by library users
  3. If PROJECT TYPE in REPOSITORY CONTEXT is library, assume unused-looking exports are consumed externally
  4. If unsure, assume it's used by library consumers`

const SYSTEM_PROMPT = `You are a specialist dead code reviewer. You are part of a parallel AI swarm analyzing a codebase.

Your job: identify dead, unreachable, or completely unused code.

${DEAD_CODE_WARNING}

Before outputting any JSON, you MUST write a <thinking> block to trace data flow, analyze edge cases, and justify your logic. 
At the end of your <thinking> block, perform a Self-Critique: ask yourself if there are any conditions where the code is actually used or if you might be hallucinating. If the code is used, drop the finding.

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
    "severity": "low",
    "title": "Exported function never imported anywhere",
    "description": "formatLegacyInvoice is exported from invoiceUtils.ts but no other file in the codebase imports it. It appears to be a leftover from a removed billing flow and can likely be deleted.",
    "filePath": "src/utils/invoiceUtils.ts",
    "lineStart": 54,
    "lineEnd": 61,
    "symbolName": "formatLegacyInvoice",
    "tags": ["dead-code", "unused-export"]
  }
]

If you find no issues: return an empty array [].
Do not invent file paths. Only reference files shown in the context.
Be specific. Reference exact file paths and line numbers from the context provided.

${DEAD_CODE_FOCUS}`

export class DeadCodeAgent extends BaseSpecialistAgent {
  name: AgentName = 'deadCode'

  protected getSystemPrompt(): string {
    return SYSTEM_PROMPT
  }
}
