# PALADE — PHASE 4: Agent Architecture

**Depends on:** Phase 3 (providers working)
**Next phase:** Phase 5 — Orchestrator + Swarm

---

## What You Are Building

6 specialist AI agents + 1 synthesis agent. Each agent receives code chunks, calls the LLM with a domain-specific system prompt, and returns structured `AgentFinding[]`. The synthesis agent receives all findings and produces the final report narrative.

After this phase: you can call a single agent on a chunk array and get structured findings back.

---

## Files to Create

```
src/agents/
├── base.ts
├── registry.ts
├── synthesis.ts
└── specialist/
    ├── security.ts
    ├── architecture.ts
    ├── performance.ts
    ├── maintainability.ts
    ├── deadCode.ts
    └── testIntelligence.ts
```

---

## Core Types (in `src/agents/base.ts`)

```ts
export type AgentName =
  | 'security'
  | 'architecture'
  | 'performance'
  | 'maintainability'
  | 'deadCode'
  | 'testIntelligence'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface AgentFinding {
  id: string                  // uuid or hash
  agentName: AgentName
  severity: Severity
  title: string               // short, 1 line
  description: string         // 2-4 sentences, specific
  filePath?: string
  lineStart?: number
  lineEnd?: number
  symbolName?: string
  tags: string[]              // e.g. ['auth', 'injection', 'sql']
  scorePenalty: number        // computed from severity
}

export interface AgentContext {
  targetDescription?: string
  targetFocus?: string[]
  projectLanguages: Language[]
  totalFiles: number
  totalChunks: number
  mode: 'standard' | 'security' | 'onboard' | 'debt' | 'ghost'
}

export interface IAgent {
  name: AgentName
  domain: string
  analyze(chunks: CodeChunk[], context: AgentContext): Promise<AgentFinding[]>
}

// Score penalty map
export const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 0.5,
  info: 0
}
```

---

## Tasks

### 1. Shared Agent Utilities (in `src/agents/base.ts`)

```ts
// Build the chunk context string to inject into user prompt
export function buildChunkContext(chunks: CodeChunk[]): string {
  return chunks.map(c =>
    `=== FILE: ${c.filePath} (lines ${c.startLine}–${c.endLine}) ===\n${c.content}`
  ).join('\n\n')
}

// Parse LLM JSON response into AgentFinding[]
export function parseFindingsResponse(
  raw: string,
  agentName: AgentName
): AgentFinding[] {
  // 1. Try direct JSON.parse
  // 2. If fails: extract JSON array with regex: /\[[\s\S]*\]/
  // 3. If still fails: log warning, return []
  // 4. Validate each finding has required fields
  // 5. Assign scorePenalty from SEVERITY_PENALTY map
  // 6. Assign id: crypto.randomUUID()
  // 7. Filter out findings with missing title or severity
}

// Inject target context into system prompt
export function buildSystemPrompt(base: string, context: AgentContext): string {
  let prompt = base
  if (context.targetDescription) {
    prompt += `\n\nSUBSYSTEM CONTEXT: ${context.targetDescription}`
  }
  if (context.targetFocus?.length) {
    prompt += `\nFOCUS AREAS: ${context.targetFocus.join(', ')}`
  }
  return prompt
}
```

### 2. Specialist Agents

Build all 6 agents. Each follows this exact pattern:

```ts
export class [Name]Agent implements IAgent {
  name: AgentName = '[name]'
  domain = '[domain label]'

  async analyze(chunks: CodeChunk[], context: AgentContext): Promise<AgentFinding[]> {
    const provider = getProvider('primary')
    const systemPrompt = buildSystemPrompt(BASE_SYSTEM_PROMPT, context)
    const userPrompt = buildChunkContext(chunks)

    const response = await provider.complete({ systemPrompt, userPrompt })
    return parseFindingsResponse(response.content, this.name)
  }
}
```

**System prompt template (all agents must follow this structure):**

```
You are a specialist [DOMAIN] code reviewer. You are part of a parallel AI swarm analyzing a codebase.

Your job: identify [DOMAIN-SPECIFIC] issues in the code provided.

Return ONLY a valid JSON array of findings. No markdown. No explanation. No preamble. Just the JSON array.

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
    "title": "SQL query built with string concatenation",
    "description": "The getUserById function builds a SQL query by concatenating user input directly into the query string. This allows SQL injection. Use parameterized queries instead.",
    "filePath": "src/db/users.ts",
    "lineStart": 34,
    "lineEnd": 38,
    "symbolName": "getUserById",
    "tags": ["sql", "injection", "security"]
  }
]

If you find no issues: return an empty array [].
Do not invent file paths. Only reference files shown in the context.
Be specific. Reference exact file paths and line numbers from the context provided.
```

**Per-agent domain instructions (add after the template above):**

**SecurityAgent** — focus on:
- Input validation gaps, SQL/command injection, auth bypass, missing rate limits, secrets hardcoded in logic, CORS misconfigs, JWT handling issues, unvalidated redirects, broken access control, cryptographic weaknesses

**ArchitectureAgent** — focus on:
- Circular dependencies, layer violations (e.g. UI code in business logic), tight coupling between unrelated modules, missing abstraction boundaries, God objects, inconsistent module boundaries, missing dependency injection

**PerformanceAgent** — focus on:
- N+1 query patterns, synchronous operations inside async loops, missing caching on expensive operations, unbounded result sets (no pagination/limit), memory leaks (event listeners not removed, unclosed streams), synchronous file I/O in request handlers

**MaintainabilityAgent** — focus on:
- Logic duplicated across 2+ files, inconsistent naming conventions within the same module, functions over 50 lines with no decomposition, missing error handling on async operations, magic numbers without constants, overly complex conditionals that could be extracted

**DeadCodeAgent** — focus on:
- Exported functions/classes never imported elsewhere, routes defined but never reached from frontend, fully implemented classes never instantiated, commented-out code blocks older than the surrounding context, feature flags that are always false, imports that are unused

**TestIntelligenceAgent** — focus on:
- Critical business logic with zero test coverage, tests that mock everything and assert nothing meaningful, missing edge case tests on validation functions, test files that import but never call the functions under test, async functions tested synchronously

### 3. `src/agents/synthesis.ts`

```ts
export interface SynthesisResult {
  executiveSummary: string        // 3-5 paragraphs
  priorityFixes: PriorityFix[]   // ordered list
  crossCuttingObservations: string[]
  debtEstimate: DebtEstimate
}

export interface PriorityFix {
  rank: number
  title: string
  rationale: string
  estimatedHours: number
  affectedFiles: string[]
}

export interface DebtEstimate {
  critical: number    // hours
  high: number
  medium: number
  low: number
  total: number
  highestROIFix: string
}
```

Synthesis agent system prompt:
```
You are the synthesis agent for a codebase review. You have received findings from 6 specialist agents.

Your job: synthesize these findings into a coherent report.

Return ONLY valid JSON matching this exact schema:
{
  "executiveSummary": "3-5 paragraph string summarizing the overall codebase health",
  "priorityFixes": [
    {
      "rank": 1,
      "title": "Fix title",
      "rationale": "Why this should be fixed first",
      "estimatedHours": 4,
      "affectedFiles": ["src/auth.ts"]
    }
  ],
  "crossCuttingObservations": [
    "Observation string about patterns that span multiple domains"
  ],
  "debtEstimate": {
    "critical": 12,
    "high": 34,
    "medium": 67,
    "low": 20,
    "total": 133,
    "highestROIFix": "Centralise auth validation — fixes 3 critical and 5 high findings"
  }
}

Be direct. Be specific. Do not repeat individual findings — synthesize patterns.
```

`analyze(allFindings, crossTargetFindings, context)`:
- Build user prompt as JSON-serialized findings array
- Call `getProvider('synthesis')`
- Parse and return `SynthesisResult`

### 4. `src/agents/registry.ts`

```ts
export const AGENT_REGISTRY: IAgent[] = [
  new SecurityAgent(),
  new ArchitectureAgent(),
  new PerformanceAgent(),
  new MaintainabilityAgent(),
  new DeadCodeAgent(),
  new TestIntelligenceAgent(),
]

export function getAgentsForMode(mode: ReviewMode): IAgent[] {
  if (mode === 'ghost') return [new DeadCodeAgent()]
  // all other modes: return full registry
  return AGENT_REGISTRY
}
```

---

## Acceptance Criteria

- Each specialist agent returns a non-empty `AgentFinding[]` when run on `test-project/`
- `parseFindingsResponse` never throws — returns `[]` on malformed JSON
- `DeadCodeAgent` finds the unused `ReportGenerator` class in `test-project/`
- `SecurityAgent` finds the hardcoded `DB_PASSWORD` in `test-project/config.ts`
- `MaintainabilityAgent` finds the duplicated validation logic in `test-project/`
- Synthesis agent returns a valid `SynthesisResult` with all fields populated
- `scorePenalty` is correctly assigned on every finding

---

## Rules for This Phase

- System prompts are hardcoded strings — not loaded from files or config
- Every agent calls `getProvider('primary')` — never instantiates a provider directly
- `parseFindingsResponse` tries regex extraction before giving up on bad JSON
- Agent `analyze()` never throws — all errors caught, logged, return `[]`
- Synthesis agent uses `getProvider('synthesis')` — not primary
