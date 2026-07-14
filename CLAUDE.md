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

## Cross-Session Memory (claude-mem) — Opt-In

This repo can also use [claude-mem](https://github.com/thedotmack/claude-mem) (`thedotmack/claude-mem`), a
Claude Code plugin that captures tool observations during a session, compresses them, and lets you search
past work (`mem-search`, `smart_search`, `timeline`, etc.) instead of re-reading files you've already seen.
It is **not** wired into the SessionStart hook — it installs a Claude Code plugin, runs a local background
worker daemon (Bun, `http://127.0.0.1:37700`), and does an `npx`-triggered install — enough side effects that
it's opt-in rather than silently auto-run on every session, local or web.

To turn it on:

```bash
npm run mem:install   # npx claude-mem install --provider claude (uses your existing Claude Code
                      # subscription for summarization — no separate API key needed)
npm run mem:start     # starts the worker daemon (http://127.0.0.1:37700)
npm run mem:status    # check whether the worker is running
```

**Where memory lives:** everything is stored in `~/.claude-mem` on the machine running it — never inside
this repo, and never committed. On a **local** checkout this persists naturally across your own sessions,
exactly as designed upstream. In a **Claude Code on the web** session, the container is ephemeral, so
`~/.claude-mem` resets on your next fresh session — running `mem:install`/`mem:start` there only gives you
memory *within* the current session (still useful on a long session), not across separate web sessions.

# Palade: Mental Model & Architecture Guide

## What Is Palade

Palade is a TypeScript CLI/TUI that runs an AI agent swarm to review codebases. Instead of sending the
entire codebase to one LLM, it: (1) **triages** files by importance (churn, centrality, naming heuristics);
(2) **chunks** them (AST-aware for TypeScript, line-based fallback); (3) **injects context** (keyword index,
symbol resolution, dependency paths); (4) **dispatches agents** in parallel (specialized for security,
architecture, performance, dead code, etc.); (5) **merges & deduplicates** findings; (6) **arbitrates
conflicts** when two agents disagree; (7) **synthesizes** a prioritized executive summary.

**Not an architectural Swiss Army knife:** Palade does code review — nothing else. It does not refactor,
execute, or generate code. Findings are read-only until a human approves them.

## The Five-Phase Pipeline

### Phase 1: Ingestion & Chunking (`src/ingestion/`)
Read all source files, understand structure, break into analyzable pieces.

- **Walker** (`walker.ts`): walks the tree, respects `.paladeignore`, collects FileManifest objects (path, LOC, churn, import count).
- **Chunker** (`chunker.ts`): TypeScript/JavaScript chunk by AST at top-level symbol boundaries; line/bracket-based fallback otherwise. Output: **CodeChunk array** — `filePath, startLine, endLine, content, symbolName, tokenCount, language`.
- **Annotation Parser** (`annotationParser.ts`): parses `@palade review/focus/ignore` comments (file- and line-level); these shape what gets reviewed.
- **Keyword Index** (`keywordIndex.ts`): searchable symbol map (exports, class/function names) across chunks — injects "related code" context without re-reading the codebase.
- **Context Packs** (`contextPacks.ts`): per chunk, "what other chunks use this symbol?" injected as retrieved context; computed over pristine chunks before mutation.
- **Estimator** (`estimator.ts`): predicts token cost per run by provider/model/agent count.

**Key insight:** chunking is not random splitting — it preserves AST boundaries, falls back gracefully, and
overlaps to avoid cutting context, which is why findings point to specific `startLine/endLine` pairs.

**Scope restrictions (hardcoded):** `MAX_TOKENS = 6000` per chunk; `CHUNK_LINES = 150` fallback size;
`CHUNK_OVERLAP = 30` lines; `CHARS_PER_TOKEN = 4` (token estimate); `MAX_CHUNKS_PER_FILE = 50`.

### Phase 2: Triage (`src/orchestrator/triage.ts`)
If the codebase is too large, pick the highest-value chunks within a token budget.

- **Input:** all chunks (e.g. 400+), FileManifest array (churn/import counts), maxReviewTokens budget (default 200k).
- **Logic:** if total tokens ≤ budget, review all. Otherwise the LLM ranks files by importance: high churn; high centrality (imported by many); heuristic names ("auth", "api", "route", "handler", "service", "middleware"); size (larger = higher risk); config files with potential hardcoded values; payment/session/user-data handlers.
- **Output:** ranked file paths; chunks taken from those files until the token budget is hit.
- **Cost:** one cheap triage call (Haiku-level, temperature 0.1) per run. Triage is not a finding — it only decides "which files should we focus on?"

### Phase 3: Swarm & Agents (`src/orchestrator/swarm.ts`, `src/agents/`)
Run multiple specialized agents over the triaged chunks in parallel.

**Swarm orchestration (swarm.ts):**
1. **Agent selection** (registry.ts): agents for the current mode (standard, security, onboard, debt, ghost). Default `agentCount` is 8 (all built-ins; registry order is priority order — trimming `agentCount` keeps security/architecture/performance first and drops pragmatism/logic last).
2. **Batching** (scheduler.ts): group chunks into batches under provider token limits; each agent processes its batches with bounded concurrency, agents themselves run in parallel.
3. **Parallelism limits:** max 5 concurrent batches per agent; per-batch timeout 600s default; an AbortController ripples through on fatal auth errors to kill the run.
4. **Error handling:** a timed-out batch keeps findings from successful batches; only fatal auth errors abort the run.
5. **Memory & dedup** (memory.ts, merger.ts): cross-reference findings across agents; merge duplicates by fingerprint/proximity/title-similarity.

**Agent architecture (agents/base.ts):** all agents implement `IAgent`:

```ts
interface IAgent {
  name: AgentName  // 'security', 'architecture', etc.
  analyze(chunks: CodeChunk[], context: AgentContext, signal?: AbortSignal): Promise<AgentFinding[]>
}
```

**Context passed to every agent:** `targetDescription`/`targetFocus` (if reviewing a target); `projectLanguages, totalFiles, totalChunks`; `mode` (standard|security|onboard|debt|ghost); `diffContext` (diff review); `annotations` (ignores & review requests); `spec` (optional business-logic doc); `constitution` (optional agent behavioral guidelines).

**Specialist agents (agents/specialist/):** each runs the same chunks with a domain-specific system prompt —
**Security** (injection, auth, secrets, input validation, crypto); **Architecture** (circular deps, layer
violations, coupling, God objects); **Performance** (N+1, unbounded loops, missing caching, sync-in-async);
**Maintainability** (duplication, naming, undocumented complexity); **Dead Code** (unused exports, zombie
routes, unwired classes, stale TODOs); **Test Intelligence** (untested critical paths, hollow mocks, missing
edge cases); **Pragmatism** (cost/benefit tradeoffs, when to defer refactoring); **Logic** (business-logic
correctness, state machine violations).

**Finding schema (every agent returns):**

```ts
interface AgentFinding {
  id: string          // UUID
  agentName: string
  severity: 'critical'|'high'|'medium'|'low'|'info'
  title: string
  description: string
  filePath?: string
  lineStart?: number  // 1-indexed
  lineEnd?: number
  symbolName?: string
  tags: string[]      // ['security', 'auth'], etc.
  scorePenalty?: number
}
```

**Economy mode (combined.ts):** default OFF (agents run in parallel, each with its own system prompt). When
ON, all built-in specialists run in a **single** provider call per batch with domain-tagged output — cuts
the ~6x resend of the same chunk content. Tradeoff: latency ↑, per-domain specificity ↓, cost ↓.

### Phase 4: Conflict Arbitration (`src/orchestrator/verdict.ts`)
When two agents disagree on the same code region, ask an arbitrator to decide.

- **Conflict detection** (memory.ts/verdict.ts): after the swarm, find findings from different agents on overlapping line ranges in the same file.
- **Arbitration:** send both findings to an LLM arbiter; get a decision + tradeoff rationale + confidence.
- **ADR:** decisions saved to `.palade/decisions/` so the team can review why a conflict was settled.
- **Finding injection:** the verdict is added as a new finding with `severity: 'info'`, tag `['architectural-decision']`.
- **Cost:** ~1 arbitration call per 5–10 findings (not every finding); tracked as a "VERDICT" finding.

### Phase 5: Synthesis (`src/agents/synthesis.ts`)
Read all findings (agent findings + verdicts) and produce a prioritized executive summary.

- **Input:** merged/deduped findings + cross-agent findings (same bug flagged by 2+ agents).
- **Output:** `{ executiveSummary, priorityFixes: [{title, impact, effort, rationale}], crossCuttingObservations, debtEstimate: {critical, high, medium, low, total, highestROIFix} }`
- **Cost:** 1 synthesis call per review run.

## Key Architectural Decisions & Constraints

1. **AST-aware chunking (not naive line splits):** TS chunks at symbol boundaries; others fall back to line-based. Trade-off: slower parsing, higher finding accuracy.
2. **Triage runs first, saves tokens:** rank files and cap review at ~200k tokens by default. Some files never get reviewed; opt-in `--exhaustive` disables triage.
3. **Context injection (keyword index + retrieved context):** each chunk gets "the other symbols this chunk uses and their definitions". Injection can overflow the token limit; splitting logic handles it.
4. **Agents run in parallel within batch limits:** batching keeps calls rate-limit compliant. Trade-off: one slow agent delays the whole swarm.
5. **Economy mode is a cost trade-off, not default:** one call for all agents = lower spend, higher latency, weaker per-domain prompts. Users choose based on budget & deadline.
6. **Findings are immutable:** Palade reports findings; it doesn't write fixes. Fixes belong to other tools (Claude Code, manual) — keeps scope tight.
7. **Annotations drive triage & ignores:** `@palade review/ignore/focus` comments steer the review. Trade-off: requires developer discipline.
8. **Verdict mode arbitrates agent conflicts:** reduces false positives & duplicates; extra cost (~1 call per 5–10 findings); disable with `--no-verdict`.

## Common Failure Modes (Things to Watch)

1. **Duplicate findings in memory** — merger dedupes by fingerprint/file/severity/title similarity; check `src/orchestrator/merger.ts` for partial-match cases.
2. **Silent file drops during triage** — if triage can't parse the LLM's JSON ranking it falls back; check `src/orchestrator/triage.ts` parse/fallback logic.
3. **Context injection bloat** — retrieved context pushing a chunk past MAX_TOKENS must trigger a re-split; check `src/ingestion/contextPacks.ts` + pipeline re-split.
4. **Agent timeout silent loss** — a timed-out batch must keep findings from earlier batches; swarm.ts uses `Promise.allSettled`, so partial success is preserved. ✓
5. **Verdict mode over-generating ADR files** — every conflict → one `.md` in `.palade/decisions/`; retention pruning exists but watch for accumulation.
6. **Custom agents don't merge into economy mode** — they always run as separate calls, weakening economy mode's savings. Intended (see `src/agents/combined.ts`).
7. **Line-number mapping drift** — a file changing mid-review stales chunk line numbers. Read once at the start; don't re-read mid-pipeline.
8. **No deduplication across modes** — separate runs overlap; synthesis doesn't merge across runs. Expected; users manage it.

## File Skip List (Don't Waste Tokens Reading These)

- **Test & fixture files:** `**/*.test.ts`, `**/*.spec.ts` — test doubles, intentional bad code, fixtures.
  Audit test *quality* only if explicitly asked; never report fixture "bugs." `src/vulnerable.ts` is a
  deliberate vulnerability catalog for testing the tool itself.
- **Auto-generated & non-source:** `dist/`, `build/`, `.next/`, `node_modules/` (excluded by walker &
  `.paladeignore`); `package-lock.json`, `*.lock`; root `*.md` docs (README, CONTRIBUTING, CHANGELOG).
- **Templates & config:** `templates/` (HTML report template); `vitest.config.ts`, `eslint.config.js`,
  `tsconfig.json` (config, not production code — reviewable only if explicitly scoped).

## Code Patterns to Recognize (No Detailed Read-Through Needed)

- **Orchestrator layer (src/orchestrator/):** `pipeline.ts` entry point (walk → chunk → context-inject →
  swarm); `swarm.ts` parallel dispatch, batching, error recovery; `triage.ts` LLM file ranking; `merger.ts`
  finding dedup; `memory.ts` cross-referencing; `verdict.ts` conflict arbitration; `scheduler.ts` batch
  grouping under token limits. *Reading strategy:* for a wrong/duplicate finding, trace merger → memory →
  swarm; don't read LLM prompts unless you suspect a domain-specific issue.
- **Ingestion layer (src/ingestion/):** `walker.ts` file discovery/ignores; `chunker.ts` AST parse +
  fallback + token estimation; `keywordIndex.ts` symbol map; `contextPacks.ts` related-code injection;
  `annotationParser.ts` `@palade` comments. *Reading strategy:* stale line numbers or missing imports →
  suspect chunking or annotation parsing.
- **Agent layer (src/agents/):** `base.ts` IAgent interface, system-prompt builder, finding parser;
  `specialist/*.ts` domain agents; `combined.ts` economy mode; `custom/` user-provided agents;
  `registry.ts` mode → agent list. *Reading strategy:* same shape everywhere — build prompt → call provider
  → parse JSON; only read domain prompts when debugging that agent's output.
- **Provider layer (src/providers/):** `router.ts` primary + fallback chain (groq → cerebras → nvidia →
  openrouter → ollama); `backoff.ts` exponential backoff + jitter; `pool.ts` request batching; per-provider
  adapters. *Reading strategy:* only dive in on auth/connection errors.
- **CLI & UI:** `cli/index.ts` + `commands/` dispatch (review, score, diff, watch); `tui/` terminal UI;
  `ui/` shared bits (banner, progress, theme, layout). *Reading strategy:* irrelevant to the core algorithm;
  skip unless debugging argument parsing or display.

## Configuration & Customization

```ts
// palade.config.ts
export default {
  providers: {
    groq: { apiKey: '...', maxConcurrency: 10 },
    cerebras: { apiKey: '...', model: 'claude-3-5-sonnet' },
    nvidia: { apiKey: '...', baseUrl: 'https://api.nvidiab.com/...' },
    ollama: { baseUrl: 'http://localhost:11434' },
  },
  swarm: {
    primary: 'groq',          // default provider
    synthesis: 'nvidia',      // synthesis provider
    agentCount: 8,            // how many built-in agents to run
    economyMode: false,       // single combined call per batch vs parallel
    maxReviewTokens: 200_000,
    timeoutMs: 600_000,
  },
  output: { dir: '.palade/reports', formats: ['html', 'json', 'md'], openBrowser: true },
  score: { historyFile: '.palade/history.json', badge: true },
}
```

- **.paladeignore** — like `.gitignore` but for review scope (`node_modules/`, `dist/`, `*.test.ts`, `*.lock`).
- **palade.spec.md** (optional) — business logic/architecture/review-goals doc injected into every agent.
- **.palade/constitution.md** (optional) — behavioral guidelines for agents ("never flag X if Y").
- **Annotations in code:** `// @palade review` — flag for review; `// @palade focus: security` — prioritize for that domain; `// @palade ignore` — don't review this line or the next (`ignore-file` for whole file).

## Entry Points & Control Flow

- **Review:** `palade review` (or `/review` in TUI) → `reviewCommand()` → load config → `runPipeline()` →
  walk → chunk → inject context → swarm → merge → verdict → synthesis → report to `.palade/reports/`
  (HTML/JSON/Markdown).
- **Diff:** `palade diff --base main` → `diffCommand()` → git diff → scope pipeline to changed files only →
  delta-only findings.
- **Score:** `palade score` → read `.palade/history.json` → compute badge + trend → display or write SVG.
- **Watch:** `palade watch` → file watcher on src/ → debounce → auto-run review; daemon until killed.

## When To Blame Which Layer

| Symptom | Likely culprit |
|---------|---|
| Findings point to wrong line numbers | chunker.ts, context packs |
| Duplicate findings in output | merger.ts |
| Agent timed out but no partial findings | swarm.ts batching |
| Triage failed silently, huge token spend | triage.ts JSON parsing |
| Custom agent not running | agents/registry.ts, custom loader |
| Economy mode not saving tokens | combined.ts, scheduler.ts |
| Provider auth error kills all agents | swarm.ts error propagation |
| `.palade/decisions/` exploding in size | verdict.ts retention logic |
| Annotation comments not respected | annotationParser.ts |
| Symbol context looks wrong | keywordIndex.ts, contextPacks.ts |

## Performance Tuning Knobs

1. `swarm.maxReviewTokens` — lower = triage earlier, fewer chunks reviewed.
2. `swarm.strictTriage` — halt review if budget exceeded (fail-safe).
3. `swarm.agentCount` — fewer = less parallelism, lower cost.
4. `swarm.economyMode` — cut the ~6x resend; trade latency + specificity.
5. Chunk size (hardcoded `MAX_TOKENS = 6000`) — reduce to force smaller, cheaper chunks.
6. `swarm.timeoutMs` — lower = faster failure, higher truncation risk.
7. `palade review --exhaustive` — skip triage, review all chunks.
8. Custom agents — disable unused specialists via config overrides.

## Mental Model Summary

**Palade is a 5-phase pipeline:** (1) ingest & chunk (preserve AST boundaries); (2) triage by importance
(LLM ranking); (3) swarm agents in parallel (domain specialists, each reads all triaged chunks); (4) merge &
arbitrate (dedup, LLM on disagreements); (5) synthesize & report (executive summary + ROI estimates).

**Key constraints:** max 6000 tokens/chunk; max 200k tokens/run by default (triage drops files beyond it);
5 concurrent batches per agent; 600s timeout per batch; one fatal auth error kills the run, other errors
keep partial findings.

**To add a finding type:** write a specialist agent. **To tweak a domain:** edit its prompt in
`specialist/*.ts`. **To change core behavior:** touch `pipeline.ts`, `swarm.ts`, or `scheduler.ts`.

**Don't waste time on:** test files (`*.test.ts`); the `vulnerable.ts` fixture; detailed LLM prompt text
(read the agent name & domain, not the prompt); provider-specific API wrappers (trust them; only debug on
auth errors).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
