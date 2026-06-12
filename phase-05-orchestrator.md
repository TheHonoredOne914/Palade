# PALADE — PHASE 5: Orchestrator + Swarm

**Depends on:** Phases 1–4 complete and compiling
**Next phase:** Phase 6 — Custom Targets + Scope Resolution

---

## What You Are Building

The swarm coordinator. Takes `CodeChunk[]` from the ingestion pipeline and `IAgent[]` from the registry, runs every agent in parallel against the full chunk set, collects their findings, cross-references them across agents, deduplicates, and feeds the merged result to the synthesis agent. This is the engine that makes Palade fast.

After this phase, the full pipeline `ingest → swarm → synthesise → result` works end-to-end. The milestone check from the README becomes possible.

---

## Files to Create

```
src/orchestrator/
├── swarm.ts
├── scheduler.ts
├── memory.ts
└── merger.ts
```

---

## Core Types (add to `src/orchestrator/types.ts`)

```ts
import type { AgentFinding, AgentName } from '../agents/base.js'
import type { CodeChunk } from '../ingestion/types.js'
import type { SynthesisResult } from '../agents/synthesis.js'

export interface ScheduledBatch {
  agentName: AgentName
  chunks: CodeChunk[]
  estimatedTokens: number
}

export interface SwarmResult {
  runId: string
  findings: AgentFinding[]
  crossAgentFindings: CrossAgentFinding[]
  synthesis: SynthesisResult
  agentTimings: Record<AgentName, number>   // ms per agent
  totalChunks: number
  totalTokensEstimated: number
  durationMs: number
}

export interface CrossAgentFinding {
  title: string
  description: string
  agents: AgentName[]          // which agents flagged this
  filePaths: string[]
  severity: 'critical' | 'high' | 'medium'
  blastRadius: number          // count of targets/files affected
}

export interface SwarmOptions {
  onAgentStart?: (agentName: AgentName) => void
  onAgentComplete?: (agentName: AgentName, findingCount: number, durationMs: number) => void
  onSynthesisStart?: () => void
  onSynthesisComplete?: (durationMs: number) => void
}
```

---

## Tasks

### 1. `src/orchestrator/scheduler.ts`

```ts
export function scheduleBatches(
  agents: IAgent[],
  chunks: CodeChunk[]
): ScheduledBatch[]
```

Implementation:

- **Every specialist agent receives ALL chunks** — do not partition by file or domain.
- Group chunks into batches that stay under a soft token limit per agent call. Use `estimatedTokens = sum(chunk.tokenCount)`. Target: 80,000 tokens per batch (conservative for 128k-context models). If all chunks fit in one batch, one batch per agent.
- If chunks exceed 80,000 tokens per batch: split into sequential batches. Each batch is a separate provider call. Findings from all batches for the same agent are merged before returning.
- Return one `ScheduledBatch` per agent (or multiple per agent if batching required).
- Log a warning if any single chunk exceeds 6,000 tokens (should have been handled in Phase 2 but guard here).

```ts
export function estimateTotalTokens(chunks: CodeChunk[]): number {
  return chunks.reduce((sum, c) => sum + c.tokenCount, 0)
}
```

### 2. `src/orchestrator/memory.ts`

```ts
export class AgentMemory {
  private store: Map<AgentName, AgentFinding[]> = new Map()

  record(agentName: AgentName, findings: AgentFinding[]): void

  getAll(): AgentFinding[]

  crossReference(): CrossAgentFinding[]
}
```

`crossReference()` implementation:

1. Build a map of `filePath → Set<AgentName>` — which agents flagged each file.
2. For each file flagged by **2 or more** agents: create a `CrossAgentFinding` with:
   - `title`: `"Multi-domain issues in ${filePath}"`
   - `description`: Summarise what each agent found (concatenate their most severe finding titles for that file)
   - `agents`: list of AgentNames that flagged it
   - `filePaths`: [filePath]
   - `severity`: highest severity among all findings in that file
   - `blastRadius`: number of unique files the symbol/finding references (from `traceDependencies` — re-use if already computed, otherwise set to 1)
3. Also check for: same `symbolName` flagged by multiple agents across different files → combine into one cross-agent finding.
4. Sort cross-agent findings by `blastRadius` descending.
5. Return `CrossAgentFinding[]`.

### 3. `src/orchestrator/merger.ts`

```ts
export function mergeFindings(findings: AgentFinding[]): AgentFinding[]
```

Deduplication rules:
1. Two findings are **duplicates** if they share the same `filePath` + `lineStart` AND their `title` strings have >70% character overlap (simple substring check — no NLP needed).
2. When deduplicating: keep the finding with **higher severity**. If equal severity, merge `tags` arrays (union, dedup). Keep the longer `description`.
3. Two findings are **near-duplicates** if they share the same `filePath` and their `lineStart` values are within 5 lines of each other AND they have the same `agentName`. Merge those as above.
4. After dedup: sort findings by severity order: `critical → high → medium → low → info`.
5. Return deduplicated, sorted `AgentFinding[]`.

```ts
export function groupBySeverity(
  findings: AgentFinding[]
): Record<'critical' | 'high' | 'medium' | 'low' | 'info', AgentFinding[]>
```

Simple groupBy. Used by reporters and scorer.

### 4. `src/orchestrator/swarm.ts`

This is the main export. Everything comes together here.

```ts
export async function runSwarm(
  chunks: CodeChunk[],
  context: AgentContext,
  options: SwarmOptions = {}
): Promise<SwarmResult>
```

Implementation (step by step):

```
1. Generate runId: crypto.randomUUID().slice(0, 8)
2. Record start time
3. Select agents: getAgentsForMode(context.mode)
4. Schedule batches: scheduleBatches(agents, chunks)
5. Initialise AgentMemory
6. Run all agents in parallel:

   const agentTimings: Record<string, number> = {}

   await Promise.all(agents.map(async (agent) => {
     const agentStart = Date.now()
     options.onAgentStart?.(agent.name)

     // Get all batches for this agent
     const batches = scheduled.filter(b => b.agentName === agent.name)
     const allFindings: AgentFinding[] = []

     for (const batch of batches) {
       try {
         const findings = await agent.analyze(batch.chunks, context)
         allFindings.push(...findings)
       } catch (err) {
         console.warn(`[swarm] ${agent.name} batch failed:`, err)
         // Never crash the swarm on single agent failure
       }
     }

     memory.record(agent.name, allFindings)
     agentTimings[agent.name] = Date.now() - agentStart
     options.onAgentComplete?.(agent.name, allFindings.length, agentTimings[agent.name])
   }))

7. Cross-reference: const crossAgentFindings = memory.crossReference()
8. Merge + deduplicate: const mergedFindings = mergeFindings(memory.getAll())
9. Run synthesis:
   options.onSynthesisStart?.()
   const synthStart = Date.now()
   const synthesis = await analyzeSynthesis(mergedFindings, crossAgentFindings, context)
   options.onSynthesisComplete?.(Date.now() - synthStart)

10. Return SwarmResult
```

**Critical constraints:**
- The swarm **never** throws. Every agent call is wrapped in try/catch. A crashing agent produces `[]` findings and a warning.
- `Promise.all` is used for max parallelism — do NOT use `p-limit` at the swarm level. The provider's own `p-limit` handles concurrency per-provider.
- Timeout: if `context.timeoutMs` is set, wrap `Promise.all` in a `Promise.race` with a timeout that resolves (not rejects) with whatever findings have accumulated. Log a warning: `Swarm timeout reached after ${ms}ms. ${completedCount}/${total} agents completed.`

---

## Integration: Wiring Up Phase 2 → 5

Create `src/orchestrator/pipeline.ts` — the single function called by the CLI:

```ts
export interface PipelineOptions {
  projectRoot: string
  scope: ScopeOptions
  context: AgentContext
  swarmOptions?: SwarmOptions
}

export async function runPipeline(opts: PipelineOptions): Promise<SwarmResult>
```

Implementation:
1. `const manifests = await walkProject(opts.projectRoot, opts.scope)`
2. `const chunks = await chunkFiles(manifests)`
3. Log: `Chunking complete: ${manifests.length} files → ${chunks.length} chunks (~${estimateTotalTokens(chunks).toLocaleString()} tokens)`
4. `return runSwarm(chunks, opts.context, opts.swarmOptions)`

---

## Milestone Check

After this phase, the following must work when you wire it manually in a test script:

```ts
// test-pipeline.ts
import { loadConfig } from './src/config/loader.js'
import { initRouter } from './src/providers/router.js'
import { runPipeline } from './src/orchestrator/pipeline.js'

const config = await loadConfig()
await initRouter(config)

const result = await runPipeline({
  projectRoot: './test-project',
  scope: { projectRoot: './test-project' },
  context: {
    projectLanguages: ['typescript'],
    totalFiles: 10,
    totalChunks: 0,
    mode: 'standard'
  },
  swarmOptions: {
    onAgentStart: (name) => console.log(`→ ${name} started`),
    onAgentComplete: (name, n, ms) => console.log(`✓ ${name}: ${n} findings (${ms}ms)`)
  }
})

console.log('Total findings:', result.findings.length)
console.log('Score-impacting:', result.findings.filter(f => f.scorePenalty > 0).length)
console.log('Synthesis summary:', result.synthesis.executiveSummary.slice(0, 200))
```

Run: `tsx test-pipeline.ts`

Expected: agents run in parallel, findings accumulate, synthesis completes. At least 5 findings total from `test-project/`.

---

## Acceptance Criteria

- `runSwarm()` executes all 6 agents in parallel (verify via timing — total time ≈ slowest single agent, not sum)
- Swarm does not crash if one agent's LLM call throws
- `crossReference()` produces at least one `CrossAgentFinding` for `test-project/config.ts` (flagged by both Security and DeadCode agents)
- `mergeFindings()` deduplicates findings referencing the same file+line from different agents
- `runPipeline()` returns a valid `SwarmResult` with `findings`, `synthesis`, and `crossAgentFindings` populated
- Timeout option: if set to 1ms, swarm resolves (not rejects) with whatever was collected

---

## Rules for This Phase

- `swarm.ts` coordinates but never calls providers directly — only agents do
- `AgentMemory` is instantiated fresh per `runSwarm()` call — never a module singleton
- `merger.ts` is a pure utility — no side effects, no I/O
- All parallel execution uses `Promise.all` — no sequential loops over agents
- `pipeline.ts` is the ONLY file the CLI will call — never import swarm/scheduler/memory directly from CLI
