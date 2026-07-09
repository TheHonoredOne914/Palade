# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Codebase Knowledge Graph (graphify) — Read This First

This repo ships a pre-built [graphify](https://github.com/Graphify-Labs/graphify) knowledge graph of its own
source tree (see the `## graphify` section at the bottom of this file for the query rules — a `PreToolUse`
hook in `.claude/settings.json` also auto-nudges toward it on broad `Read`/`Grep`/`Glob`/search calls). The
`.claude/hooks/session-start.sh` SessionStart hook installs the `graphify` CLI automatically on Claude Code
on the web; locally, install it with `pip install graphifyy` (or `pipx install graphifyy`).

It was built with `graphify extract . --code-only` — local tree-sitter AST extraction only, no LLM calls, no
API key required — currently 794 nodes / 2276 edges. It captures imports, calls, containment, and inferred
indirect-call edges; it does **not** cover `docs/` prose or other non-code files (code-only mode skips
those). `graphify-out/graph.html` is an interactive force-directed visualization you can open in a browser.

**Keeping it fresh:** the graph is a point-in-time snapshot pinned to a commit (see "Graph Freshness" in
`GRAPH_REPORT.md`). After non-trivial structural changes (new files, moved symbols, changed imports),
regenerate it before relying on query results for those areas — `graphify update . --force` (no LLM needed)
followed by `graphify cluster-only . --no-label` to refresh `GRAPH_REPORT.md`/`graph.html` — then commit the
regenerated `graphify-out/` files alongside your code change. Skip this for doc-only or comment-only edits.

# Palade: Mental Model \& Architecture Guide



\## What Is Palade



Palade is a TypeScript CLI/TUI that runs an AI agent swarm to review codebases. Instead of sending your entire codebase to one LLM, it:

1\. \*\*Triages\*\* files by importance (churn, centrality, naming heuristics)

2\. \*\*Chunks\*\* them (AST-aware for TypeScript, line-based fallback)

3\. \*\*Injects context\*\* (keyword index, symbol resolution, dependency paths)

4\. \*\*Dispatches agents\*\* in parallel (specialized for security, architecture, performance, dead code, etc.)

5\. \*\*Merges \& deduplicates\*\* findings

6\. \*\*Arbitrates conflicts\*\* when two agents disagree

7\. \*\*Synthesizes\*\* a prioritized executive summary



\*\*Not an architectural Swiss Army knife:\*\* Palade does code review—nothing else. It does not refactor, execute, or generate code. Findings are read-only until a human approves them.



\---



\## The Five-Phase Pipeline



\### Phase 1: Ingestion \& Chunking (`src/ingestion/`)

\*\*Job:\*\* Read all source files, understand their structure, break them into analyzable pieces.



\- \*\*Walker\*\* (`walker.ts`): Walks the project tree, respects `.paladeignore`, collects FileManifest objects (path, LOC, churn, import count).

\- \*\*Chunker\*\* (`chunker.ts`): Reads each file. For TypeScript/JavaScript, uses the AST (`typescript` lib) to chunk by top-level symbols (functions, classes, interfaces). Max chunk size: 6000 tokens (\~150 lines). Overlap: 30 lines. Falls back to line-based chunking if AST parsing fails. \*\*Output: CodeChunk array\*\* — each chunk has `filePath, startLine, endLine, content, symbolName, tokenCount, language`.

\- \*\*Annotation Parser\*\* (`annotationParser.ts`): Looks for `@palade review`, `@palade focus`, `@palade ignore` comments. File-level and line-level ignores. These shape what actually gets reviewed.

\- \*\*Keyword Index\*\* (`keywordIndex.ts`): Builds a searchable map of important symbols (exports, class names, function names) across all chunks. Used to inject "related code" context into each chunk without re-reading the full codebase.

\- \*\*Context Packs\*\* (`contextPacks.ts`): For each chunk, looks up "what other chunks use this symbol?" and injects those as retrieved context. Avoids redundancy by computing over pristine chunks before mutation.

\- \*\*Estimator\*\* (`estimator.ts`): Predicts token cost for a run. Breaks down by provider, model, and agent count.



\*\*Key insight:\*\* Chunking is not random splitting. It preserves AST boundaries for TypeScript (respects function/class scope), falls back gracefully, and overlaps to avoid cutting off context. This is why findings point to specific `startLine/endLine` pairs, not vague file-level issues.



\*\*Scope restrictions (hardcoded):\*\*

\- `MAX\_TOKENS = 6000` per chunk

\- `CHUNK\_LINES = 150` fallback line-based size

\- `CHUNK\_OVERLAP = 30` lines

\- `CHARS\_PER\_TOKEN = 4` (token estimate)

\- `MAX\_CHUNKS\_PER\_FILE = 50`



\---



\### Phase 2: Triage (`src/orchestrator/triage.ts`)

\*\*Job:\*\* If the codebase is too large, pick the highest-value chunks to review within a token budget.



\- \*\*Input:\*\* AllChunks (e.g., 400+), FileManifest array (with churn/import counts), maxReviewTokens budget (default 200k).

\- \*\*Logic:\*\* If total tokens ≤ budget, review all. Otherwise, call the LLM to rank files by importance:

&#x20; - High churn (frequently modified)

&#x20; - High centrality (imported by many)

&#x20; - Heuristic names: "auth", "api", "route", "handler", "service", "middleware"

&#x20; - Size (larger = higher risk)

&#x20; - Config files with potential hardcoded values

&#x20; - Payment/session/user data handlers

\- \*\*Output:\*\* Ranked list of file paths. Take chunks from those files until token budget is hit.



\*\*Cost:\*\* One cheap triage call (Haiku-level, temperature 0.1) per review run. No sub-agent parallelism yet.



\*\*Important:\*\* Triage is not a finding. It's just "which files should we focus on?" The actual analysis happens next.



\---



\### Phase 3: Swarm \& Agents (`src/orchestrator/swarm.ts`, `src/agents/`)

\*\*Job:\*\* Run multiple specialized agents over the triaged chunks in parallel.



\#### Swarm Orchestration (swarm.ts)

1\. \*\*Agent selection\*\* (registry.ts): Get the agents for the current mode (standard, security, onboard, debt, ghost). Default is 6 parallel agents (security, architecture, performance, maintainability, deadCode, testIntelligence).

2\. \*\*Batching\*\* (scheduler.ts): Group chunks into batches (max \~150k tokens per batch to stay under provider limits). Each agent processes all batches sequentially, but agents themselves run in parallel.

3\. \*\*Parallelism limits:\*\* Max 5 concurrent batches per agent. Per-agent timeouts: 300s default. AbortController ripples through on fatal auth errors to kill the whole run.

4\. \*\*Error handling:\*\* If one batch times out, keep the findings from successful batches. Only fatal auth errors abort the run.

5\. \*\*Memory \& dedup\*\* (memory.ts, merger.ts): After all agents finish, cross-reference findings (which files did multiple agents flag?). Merge duplicates by `(filePath, severity, class)`.



\#### Agent Architecture (agents/base.ts)

All agents implement `IAgent`:

```ts

interface IAgent {

&#x20; name: AgentName  // 'security', 'architecture', etc.

&#x20; domain: string

&#x20; analyze(chunks: CodeChunk\[], context: AgentContext, signal?: AbortSignal): Promise<AgentFinding\[]>

}

```



\*\*Context passed to every agent:\*\*

\- `targetDescription`, `targetFocus` (if reviewing a target)

\- `projectLanguages, totalFiles, totalChunks`

\- `mode` (standard|security|onboard|debt|ghost)

\- `diffContext` (if diff review)

\- `annotations` (file/line ignores \& review requests)

\- `spec` (optional business logic doc)

\- `constitution` (optional agent behavioral guidelines)



\#### Specialist Agents (agents/specialist/)

Each runs the same chunk(s) with a domain-specific system prompt:

\- \*\*Security:\*\* Injection, auth, secrets, input validation, cryptography

\- \*\*Architecture:\*\* Circular deps, layer violations, coupling, God objects

\- \*\*Performance:\*\* N+1, unbounded loops, missing caching, sync-in-async

\- \*\*Maintainability:\*\* Duplication, naming, undocumented complexity

\- \*\*Dead Code:\*\* Unused exports, zombie routes, unwired classes, stale TODOs

\- \*\*Test Intelligence:\*\* Untested critical paths, hollow mocks, missing edge cases

\- \*\*Pragmatism\*\* (optional): Cost/benefit tradeoffs, when to defer refactoring

\- \*\*Logic\*\* (optional): Business logic correctness, state machine violations



\*\*Finding schema (every agent returns):\*\*

```ts

interface AgentFinding {

&#x20; id: string          // UUID

&#x20; agentName: string

&#x20; severity: 'critical'|'high'|'medium'|'low'|'info'

&#x20; title: string

&#x20; description: string

&#x20; filePath?: string

&#x20; lineStart?: number  // 1-indexed

&#x20; lineEnd?: number

&#x20; symbolName?: string

&#x20; tags: string\[]      // \['security', 'auth'], etc.

&#x20; scorePenalty: number

}

```



\#### Economy Mode (combined.ts)

\*\*Default:\*\* OFF. Agents run in parallel, each gets its own system prompt.



\*\*When ON:\*\* All 6 domain specialists run in a \*\*single\*\* provider call per batch, with domain-tagged output sections. Reduces \~6x resend of the same chunk content. Tradeoff: latency ↑, per-domain prompt specificity ↓. Cost ↓.



\---



\### Phase 4: Conflict Arbitration (`src/orchestrator/verdict.ts`)

\*\*Job:\*\* When two agents disagree on the same code region, ask an arbitrator to decide.



\- \*\*Conflict detection\*\* (memory.ts): After swarm, look for findings from different agents on overlapping line ranges in the same file.

\- \*\*Arbitration:\*\* Send both findings to an LLM arbiter (usually Claude). Return a decision + tradeoff rationale + confidence.

\- \*\*ADR (Architecture Decision Record):\*\* Save decisions to `.palade/decisions/` so the team can review why a conflict was settled a certain way.

\- \*\*Finding injection:\*\* Arbitrator's decision is added as a new finding with `severity: 'info'` and tag `\['architectural-decision']`.



\*\*Cost:\*\* \~1 arbitration call per 5–10 findings (not every finding). Marked as a "VERDICT" finding so downstream can track it.



\---



\### Phase 5: Synthesis (`src/agents/synthesis.ts`)

\*\*Job:\*\* Read all findings (agent findings + verdicts) and produce a prioritized executive summary.



\- \*\*Input:\*\* All merged/deduped findings + cross-agent findings (same bug flagged by 2+ agents)

\- \*\*Output:\*\* 

&#x20; ```ts

&#x20; {

&#x20;   executiveSummary: string

&#x20;   priorityFixes: Array<{title, impact, effort, rationale}>

&#x20;   crossCuttingObservations: string\[]

&#x20;   debtEstimate: {critical, high, medium, low, total, highestROIFix}

&#x20; }

&#x20; ```

\- \*\*Cost:\*\* 1 synthesis call per review run.



\---



\## Key Architectural Decisions \& Constraints



\### 1. \*\*AST-Aware Chunking (Not Naive Line Splits)\*\*

TypeScript files are parsed into an AST and chunked at symbol boundaries (function/class scope). This preserves semantic context. Non-TypeScript files fall back to line-based chunking. 

\- \*\*Why:\*\* Keeps related code together; avoids splitting a function across chunks.

\- \*\*Trade-off:\*\* Slower parsing, but finding accuracy ↑.



\### 2. \*\*Triage Phase Runs First, Saves Tokens\*\*

Before swarm, rank files and cap review to \~200k tokens by default. This saves budget on large projects.

\- \*\*Why:\*\* 400+ chunks on a 1MLOC project is unsustainable. Pick the risky ones.

\- \*\*Trade-off:\*\* Some files never get reviewed. Opt-in `--exhaustive` to disable.



\### 3. \*\*Context Injection (Keyword Index + Retrieved Context)\*\*

Every chunk gets a prefix injected: "here are other symbols this chunk uses, here's their definitions."

\- \*\*Why:\*\* Agents understand cross-file dependencies without re-reading everything.

\- \*\*Trade-off:\*\* Injection can push chunks over token limit; splitting logic handles overflow.



\### 4. \*\*Agents Run in Parallel, But Within Batch Limits\*\*

6 agents × \~45 chunks (triaged) = not 270 calls. Batches group chunks; each agent makes \~9 calls (45 chunks / 5 concurrent batches).

\- \*\*Why:\*\* Rate-limit compliance, latency management, token budget.

\- \*\*Trade-off:\*\* One slow agent delays the whole swarm.



\### 5. \*\*Economy Mode is a Cost Trade-off, Not Default\*\*

All agents in one call = lower token spend, higher latency, weaker per-domain prompts. Default OFF because latency > cost for most users.

\- \*\*Why:\*\* Flexibility. Users choose based on budget \& deadline.

\- \*\*Trade-off:\*\* Economy-mode findings may be less precise per domain.



\### 6. \*\*Findings Are Immutable in Code Review\*\*

Palade reports findings; it doesn't write fixes. Fixes are done by other tools (Claude Code, manual). 

\- \*\*Why:\*\* Code review is a read-only analysis. Fixes require tests \& integration. Keeps scope tight.



\### 7. \*\*Annotations (Comments) Drive Triage \& Ignores\*\*

You can annotate code with `@palade review`, `@palade ignore`, `@palade focus`. These annotations shape what gets reviewed.

\- \*\*Why:\*\* Developers know their hotspots. Let them steer the review.

\- \*\*Trade-off:\*\* Requires developer discipline to use consistently.



\### 8. \*\*Verdict Mode Arbitrates Agent Conflicts\*\*

When Security and Architecture disagree on the same code, ask an LLM to decide.

\- \*\*Why:\*\* Reduces false positives \& duplicates. Builds trust in findings.

\- \*\*Trade-off:\*\* Extra cost (\~1 call per 5–10 findings). Can be disabled with `--no-verdict`.



\---



\## Common Failure Modes (Things to Watch)



\### 1. \*\*Duplicate Findings in Memory\*\*

If two agents flag the same issue, the merger should dedupe by `(filePath, severity, description)`. If merging is broken, you'll see the same finding twice.

\- \*\*Check:\*\* `src/orchestrator/merger.ts`. Does the dedup logic cover partial-match cases?



\### 2. \*\*Silent File Drops During Triage\*\*

If triage fails to parse the LLM's JSON ranking, it silently falls back to "review all" and blows the token budget.

\- \*\*Check:\*\* `src/orchestrator/triage.ts` lines 77–95. Catch JSON parse errors? Fallback logic?



\### 3. \*\*Context Injection Bloat\*\*

If retrieved context makes a chunk larger than MAX\_TOKENS, the splitter should re-chunk. If not, large chunks get truncated at the provider level.

\- \*\*Check:\*\* `src/ingestion/contextPacks.ts`. Does injection account for token overflow?



\### 4. \*\*Agent Timeout Silent Loss\*\*

An agent times out on batch 3 of 10. Does swarm keep findings from batches 1–2? It should.

\- \*\*Check:\*\* `src/orchestrator/swarm.ts` lines 111–132. `Promise.allSettled` means partial success is preserved. ✓



\### 5. \*\*Verdict Mode Over-Generating ADR Files\*\*

Every conflict → one `.md` file in `.palade/decisions/`. If there are 50 conflicts, that's 50 files. No built-in cleanup.

\- \*\*Check:\*\* Is there a `.paladeignore` for the decisions dir, or do they accumulate?



\### 6. \*\*Custom Agents Don't Merge into Economy Mode\*\*

Custom agents always run as separate calls, even in economy mode. This breaks the token-savings promise of economy mode if you have custom agents.

\- \*\*Check:\*\* `src/agents/combined.ts` comment on line 39. Intended behavior; document it.



\### 7. \*\*Line-Number Mapping Drift\*\*

If a file is modified during a review (unlikely in practice, but possible in CI), chunk line numbers become stale. Findings point to the wrong lines.

\- \*\*Check:\*\* Read the file once at the start; don't re-read mid-pipeline.



\### 8. \*\*No Deduplication Across Modes\*\*

If you run in `security` mode, then `architecture` mode, findings overlap. No built-in dedup across runs.

\- \*\*Check:\*\* Synthesis doesn't merge findings from separate runs. Expected behavior; users must manage it.



\---



\## File Skip List (Don't Waste Tokens Reading These)



\### Test \& Fixture Files

\- `\*\*/\*.test.ts`, `\*\*/\*.spec.ts` — test doubles, intentional bad code, fixture data. Audit test \*quality\* only if explicitly asked; never report fixture "bugs."

\- `src/vulnerable.ts` — a deliberate vulnerability catalog for testing the tool itself.



\### Auto-Generated \& Non-Source

\- `dist/`, `build/`, `.next/`, `node\_modules/` — excluded by walker \& `.paladeignore`

\- `package-lock.json`, `\*.lock` — config, not source

\- `\*.md` in root (README, CONTRIBUTING, CHANGELOG) — docs, not code to review



\### Templates \& Config

\- `templates/` — HTML report template, not runtime code

\- `vitest.config.ts`, `eslint.config.js`, `tsconfig.json` — config, not production code (can be reviewed if explicitly scoped)



\---



\## Code Patterns to Recognize (No Detailed Read-Through Needed)



\### Orchestrator Layer (src/orchestrator/)

\- \*\*Pipeline\*\* (`pipeline.ts`): Entry point. Walks → chunks → context-injects → swarm.

\- \*\*Swarm\*\* (`swarm.ts`): Parallel agent dispatch, batch scheduling, error recovery.

\- \*\*Triage\*\* (`triage.ts`): LLM-based file ranking to hit token budget.

\- \*\*Merger\*\* (`merger.ts`): Dedup findings by file/severity/message.

\- \*\*Memory\*\* (`memory.ts`): Track which agent found what; cross-reference.

\- \*\*Verdict\*\* (`verdict.ts`): Arbitrate agent disagreements via LLM.

\- \*\*Scheduler\*\* (`scheduler.ts`): Group chunks into batches respecting token limits.



\*\*Reading strategy:\*\* If a finding seems wrong (duplicate, wrong file, etc.), trace through merger → memory → swarm. Don't read the LLM prompts themselves unless you suspect a domain-specific issue.



\### Ingestion Layer (src/ingestion/)

\- \*\*Walker\*\* (`walker.ts`): File discovery, `.paladeignore` parsing.

\- \*\*Chunker\*\* (`chunker.ts`): AST parsing (TypeScript), fallback line-split, token estimation.

\- \*\*Keyword Index\*\* (`keywordIndex.ts`): Build \& query symbol map.

\- \*\*Context Packs\*\* (`contextPacks.ts`): Inject related code into chunks.

\- \*\*Annotation Parser\*\* (`annotationParser.ts`): Parse `@palade` comments.



\*\*Reading strategy:\*\* If findings are out-of-sync with the actual code (stale line numbers, missing imports), suspect chunking or annotation parsing.



\### Agent Layer (src/agents/)

\- \*\*Base\*\* (`base.ts`): IAgent interface, system prompt builder, finding parser.

\- \*\*Specialist\*\* (`specialist/\*.ts`): Domain-specific agents (security, architecture, etc.)

\- \*\*Combined\*\* (`combined.ts`): Economy-mode multi-domain agent.

\- \*\*Custom\*\* (`custom/agent.ts`, `loader.ts`): User-provided agents via config.

\- \*\*Registry\*\* (`registry.ts`): Agent factory; maps mode → agent list.



\*\*Reading strategy:\*\* Don't read domain-specific prompts in detail unless debugging a specific agent's output. The architecture is the same: build prompt → call provider → parse JSON response.



\### Provider Layer (src/providers/)

\- \*\*Router\*\* (`router.ts`): Select primary provider; fallback chain (groq → cerebras → nvidia → openrouter → ollama).

\- \*\*Backoff\*\* (`backoff.ts`): Exponential backoff + jitter on rate limits.

\- \*\*Pool\*\* (`pool.ts`): Batch multiple requests; one connection per provider.

\- \*\*Individual adapters\*\* (groq.ts, nvidia.ts, etc.): Provider-specific API wrapping.



\*\*Reading strategy:\*\* Only dive into provider layer if getting auth/connection errors. Architecture is consistent: build request → retry with backoff → fallback to next provider.



\### CLI \& UI

\- \*\*CLI\*\* (`cli/index.ts`, `commands/`): Command dispatch (review, score, diff, watch, etc.)

\- \*\*TUI\*\* (`tui/`): Terminal UI (commands, hooks, input handling)

\- \*\*UI\*\* (`ui/`): Shared UI bits (banner, progress, theme, layout)



\*\*Reading strategy:\*\* Irrelevant to core algorithm. Skip unless debugging CLI argument parsing or TUI display issues.



\---



\## Configuration \& Customization



\### palade.config.ts

```ts

export default {

&#x20; providers: {

&#x20;   groq: { apiKey: '...', maxConcurrency: 10 },

&#x20;   cerebras: { apiKey: '...', model: 'claude-3-5-sonnet' },

&#x20;   nvidia: { apiKey: '...', baseUrl: 'https://api.nvidiab.com/...' },

&#x20;   ollama: { baseUrl: 'http://localhost:11434' },

&#x20; },

&#x20; swarm: {

&#x20;   primary: 'groq',          // Which provider to use by default

&#x20;   synthesis: 'nvidia',      // Which provider for synthesis

&#x20;   agentCount: 6,            // How many agents to run

&#x20;   economyMode: false,       // Single call per batch (all agents) vs parallel

&#x20;   maxReviewTokens: 200\_000,

&#x20;   timeoutMs: 600\_000,

&#x20; },

&#x20; output: {

&#x20;   dir: '.palade/reports',

&#x20;   formats: \['html', 'json', 'md'],

&#x20;   openBrowser: true,

&#x20; },

&#x20; score: {

&#x20;   historyFile: '.palade/history.json',

&#x20;   badge: true,

&#x20; },

}

```



\### .paladeignore

Like `.gitignore`, but for review scope:

```

node\_modules/

dist/

\*.test.ts

\*.lock

```



\### palade.spec.md (optional)

User-provided document describing the codebase's business logic, architectural constraints, and review goals. Injected into every agent's context.



\### .palade/constitution.md (optional)

User-provided behavioral guidelines for agents. E.g., "never flag X as a bug if Y is true."



\### Annotations in code

```ts

// @palade review — flag this for review

function criticalAuthLogic() { ... }



// @palade focus: security — prioritize this for security review

function handlePayment() { ... }



// @palade ignore — don't review this line or the next

// intentional: legacy code, not worth refactoring

const oldUtility = (...) => { ... }

```



\---



\## Entry Points \& Control Flow



\### Review Flow

1\. User runs `palade review` or `/review` in TUI

2\. CLI dispatches to `reviewCommand()` → loads config → calls `runPipeline()`

3\. Pipeline: walk → chunk → inject context → swarm → merge → verdict → synthesis → report

4\. Report written to `.palade/reports/` in configured formats (HTML, JSON, Markdown)



\### Diff Flow

1\. User runs `palade diff --base main`

2\. `diffCommand()` → git diff main → extract changed files → scope pipeline to diffs only

3\. Agents review only the changed chunks

4\. Report shows delta-only findings



\### Score Flow

1\. User runs `palade score`

2\. `scoreCommand()` → read `.palade/history.json` → compute badge + historical trend

3\. Display or write badge SVG



\### Watch Flow

1\. User runs `palade watch`

2\. File watcher on src/ → debounce → auto-run review

3\. Daemon mode; runs until killed



\---



\## When To Blame Which Layer



| Symptom | Likely Culprit |

|---------|---|

| Findings point to wrong line numbers | chunker.ts, context packs |

| Duplicate findings in output | merger.ts |

| Agent timed out but no partial findings | swarm.ts batching |

| Triage failed silently, huge token spend | triage.ts JSON parsing |

| Custom agent not running | agents/registry.ts, custom loader |

| Economy mode not saving tokens | combined.ts, scheduler.ts |

| Provider auth error kills all agents | swarm.ts error propagation |

| `.palade/decisions/` exploding in size | verdict.ts (no cleanup logic) |

| Annotation comments not respected | annotationParser.ts |

| Symbol context looks wrong | keywordIndex.ts, contextPacks.ts |



\---



\## Performance Tuning Knobs



1\. \*\*Token budget\*\* (`swarm.maxReviewTokens`): Lower = triage earlier, fewer chunks reviewed.

2\. \*\*Triage aggressiveness\*\* (`swarm.strictTriage`): Halt review if budget exceeded (fail-safe).

3\. \*\*Agent count\*\* (`swarm.agentCount`): Fewer = less parallelism, lower cost.

4\. \*\*Economy mode\*\* (`swarm.economyMode`): Reduce \~6x resend, trade latency + specificity.

5\. \*\*Chunk size\*\* (hardcoded `MAX\_TOKENS = 6000`): Reduce to force smaller, cheaper chunks.

6\. \*\*Timeout\*\* (`swarm.timeoutMs`): Lower = faster failure, higher risk of truncation.

7\. \*\*Exhaustive mode\*\* (`palade review --exhaustive`): Skip triage, review all chunks.

8\. \*\*Custom agents\*\*: Disable unused specialists via config overrides.



\---



\## Mental Model Summary



\*\*Palade is a 5-phase pipeline:\*\*

1\. Ingest \& chunk (preserve AST boundaries)

2\. Triage by importance (LLM-based ranking)

3\. Swarm agents in parallel (6 specialists, each reads all chunks)

4\. Merge \& arbitrate conflicts (dedup, ask LLM on disagreements)

5\. Synthesize \& report (executive summary + ROI estimates)



\*\*Key constraints:\*\*

\- Max 6000 tokens per chunk

\- Max 200k tokens per review run (by default; triage drops files if exceeded)

\- 5 concurrent batches per agent

\- 300s timeout per batch

\- One fatal auth error kills the entire run; other errors keep partial findings



\*\*To add a finding type:\*\* Write a specialist agent. To tweak a domain: Edit the domain-specific system prompt in `specialist/\*.ts`. To change core behavior: Touch `pipeline.ts`, `swarm.ts`, or `scheduler.ts`.



\*\*Don't waste time on:\*\*

\- Test files (`\*.test.ts`)

\- The `vulnerable.ts` fixture

\- Detailed LLM prompt text (read the agent name \& domain, not the prompt)

\- Provider-specific API wrappers (trust they work; only debug on auth errors)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
