# Palade — Technical Requirements Document (TRD)
**Version:** 0.1  
**Status:** Draft

---

## 1. System Overview

Palade is a CLI tool built in TypeScript/Node.js. It ingests a codebase, splits it into structured context chunks, distributes those chunks across a parallel swarm of LLM agents, collects and synthesises findings, and outputs a structured review report. It runs entirely locally on the user's machine using their own API keys for Groq, Cerebras, and/or NVIDIA NIM.

---

## 2. Repository Structure

```
palade/
├── src/
│   ├── cli/                    # CLI entrypoint and command definitions
│   │   ├── index.ts            # Main CLI (commander.js)
│   │   ├── commands/
│   │   │   ├── review.ts       # palade review
│   │   │   ├── diff.ts         # palade diff
│   │   │   ├── watch.ts        # palade watch
│   │   │   ├── score.ts        # palade score
│   │   │   └── targets.ts      # palade targets search/add
│   │   └── picker.ts           # --pick interactive selector (ink/inquirer)
│   │
│   ├── ingestion/              # Codebase reading and chunking
│   │   ├── walker.ts           # File system traversal + .paladeignore
│   │   ├── chunker.ts          # Semantic chunking strategy
│   │   ├── symbolResolver.ts   # Symbol-level scope (file::Function)
│   │   ├── dependencyTracer.ts # Import graph for symbol scope
│   │   └── annotationParser.ts # @palade comment parsing
│   │
│   ├── providers/              # LLM provider adapters
│   │   ├── base.ts             # IProvider interface
│   │   ├── groq.ts             # Groq adapter (primary swarm)
│   │   ├── cerebras.ts         # Cerebras adapter (synthesis)
│   │   ├── nvidia.ts           # NVIDIA NIM adapter
│   │   └── router.ts           # Provider selection + fallback logic
│   │
│   ├── agents/                 # Agent definitions
│   │   ├── base.ts             # IAgent interface
│   │   ├── registry.ts         # Agent registry
│   │   ├── specialist/
│   │   │   ├── security.ts
│   │   │   ├── architecture.ts
│   │   │   ├── performance.ts
│   │   │   ├── maintainability.ts
│   │   │   ├── deadCode.ts
│   │   │   └── testIntelligence.ts
│   │   └── synthesis.ts        # Final synthesis agent (Cerebras)
│   │
│   ├── orchestrator/           # Swarm coordination
│   │   ├── swarm.ts            # Main parallel executor
│   │   ├── scheduler.ts        # Chunk-to-agent assignment
│   │   ├── memory.ts           # Cross-agent shared finding store
│   │   └── merger.ts           # Finding deduplication + merge
│   │
│   ├── targets/                # Custom target system
│   │   ├── loader.ts           # palade.targets.ts reader + validator
│   │   ├── schema.ts           # Zod schema for target definitions
│   │   └── registry.ts         # Community target pack manager
│   │
│   ├── scorer/                 # Health score computation
│   │   ├── calculator.ts       # Score formula per dimension
│   │   ├── badge.ts            # SVG badge generator
│   │   └── history.ts          # Score history read/write
│   │
│   ├── reporters/              # Output formatters
│   │   ├── html.ts             # Local HTML report (auto-opens browser)
│   │   ├── json.ts             # Machine-readable JSON
│   │   ├── markdown.ts         # .md summary
│   │   └── terminal.ts         # Terminal progress + summary
│   │
│   └── config/                 # Configuration loading
│       ├── loader.ts           # palade.config.ts reader
│       ├── schema.ts           # Zod config schema
│       └── defaults.ts         # Sensible defaults
│
├── templates/
│   ├── report.html             # HTML report template
│   └── badge.svg               # Badge SVG template
│
├── scripts/
│   └── postinstall.ts          # First-run setup, config scaffold
│
├── palade.config.ts            # User config (added to project root)
├── palade.targets.ts           # User targets (added to project root)
├── .paladeignore               # Ignore patterns
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. Configuration Schema

### 3.1 `palade.config.ts`

```typescript
interface PaladeConfig {
  providers: {
    groq?: {
      apiKey: string;                    // process.env.GROQ_API_KEY
      model?: string;                    // default: "llama-3.3-70b-versatile"
      maxConcurrency?: number;           // default: 8
    };
    cerebras?: {
      apiKey: string;
      model?: string;                    // default: "llama-3.3-70b"
    };
    nvidia?: {
      apiKey: string;
      baseUrl?: string;
      model?: string;
    };
  };
  swarm: {
    primary: "groq" | "cerebras" | "nvidia";   // parallel agents
    synthesis: "groq" | "cerebras" | "nvidia"; // final synthesis
    agentCount?: number;                        // default: 6
    timeoutMs?: number;                         // default: 120000
  };
  output: {
    dir?: string;               // default: ".palade/reports"
    formats?: OutputFormat[];   // default: ["html", "json"]
    openBrowser?: boolean;      // default: true
    port?: number;              // default: 4242
  };
  score: {
    historyFile?: string;       // default: ".palade/history.json"
    badge?: boolean;            // default: true
    badgePath?: string;         // default: "palade-badge.svg"
  };
}
```

### 3.2 `palade.targets.ts`

```typescript
interface PaladeTarget {
  name: string;                  // identifier used in --target flag
  description: string;           // injected into agent system prompt
  entry: string[];               // paths relative to project root
  focus?: string[];              // domain hints: "security", "data flow", etc.
  agents?: AgentName[];          // override which specialist agents run
  ignore?: string[];             // target-local ignore patterns
}

type PaladeTargets = PaladeTarget[];
```

Validated via Zod on load. Schema errors reported with file + line reference.

---

## 4. Ingestion Pipeline

### 4.1 File Walker

```
walker.ts
  → reads .paladeignore (+ default ignores: node_modules, dist, .git, *.lock)
  → traverses directory tree
  → filters by scope (dir/file/glob/symbol args)
  → returns: FileManifest[]
```

```typescript
interface FileManifest {
  path: string;           // relative path
  language: Language;     // ts, js, py, go, rust, etc.
  sizeBytes: number;
  linesOfCode: number;
  annotations: Annotation[];  // parsed @palade comments
  lastModified: Date;
}
```

### 4.2 Semantic Chunker

The chunker does NOT split files at arbitrary token limits. It splits at semantic boundaries:

- **TypeScript/JavaScript:** splits at top-level function, class, and module boundaries using tree-sitter
- **Python:** splits at function and class definitions
- **Other languages:** falls back to sliding window with 200-line overlap

```typescript
interface CodeChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  symbolName?: string;    // if chunk is a named symbol
  tokenCount: number;
  language: Language;
}
```

Target chunk size: 2,000–4,000 tokens. Chunks over 6,000 tokens are split with overlap.

### 4.3 Symbol Resolver

When `file.ts::FunctionName` syntax is used:

1. Parse the file with tree-sitter to locate the symbol
2. Extract the symbol's content
3. Trace imports — identify all files the symbol depends on directly
4. Add those dependency files to the review scope (one level deep by default, configurable with `--depth`)

### 4.4 Annotation Parser

Scans all in-scope files for `@palade` comments before chunking. Returns a map of `filePath → Annotation[]` used to:
- Filter scope to only annotated items (`--annotations` flag)
- Inject annotation context into agent prompts
- Mark files/symbols as ignored pre-swarm

---

## 5. Provider Architecture

### 5.1 IProvider Interface

```typescript
interface IProvider {
  name: string;
  complete(prompt: CompletionRequest): Promise<CompletionResponse>;
  isAvailable(): Promise<boolean>;
  estimateTokens(text: string): number;
  rateLimit: RateLimitConfig;
}
```

### 5.2 Provider Router

On startup, the router:
1. Checks availability of all configured providers (`isAvailable()`)
2. Assigns `primary` provider to swarm agents
3. Assigns `synthesis` provider to the synthesis agent
4. If primary is unavailable, falls back to next available provider
5. Logs provider assignment in terminal output

```
Provider check:
  ✓ Groq          available  → swarm agents (x6)
  ✓ Cerebras      available  → synthesis agent
  ✗ NVIDIA NIM    unavailable (invalid key)
```

### 5.3 Groq Adapter

- Uses Groq's OpenAI-compatible API
- Default model: `llama-3.3-70b-versatile`
- Concurrency controlled by `maxConcurrency` (default 8)
- Retry logic: 3 attempts with exponential backoff on 429
- Token budget per agent call: 4,096 output tokens

### 5.4 Cerebras Adapter

- Used for synthesis (single deep call on aggregated findings)
- Higher context window model preferred
- Default model: `llama-3.3-70b`
- Single call pattern, not parallel

### 5.5 NVIDIA NIM Adapter

- OpenAI-compatible endpoint (`baseUrl` configurable)
- Supports any NIM-hosted model
- Used as primary swarm provider if configured and Groq unavailable

---

## 6. Agent Architecture

### 6.1 IAgent Interface

```typescript
interface IAgent {
  name: AgentName;
  domain: string;
  systemPrompt: string;
  analyze(chunks: CodeChunk[], context: AgentContext): Promise<AgentFinding[]>;
}

interface AgentContext {
  targetDescription?: string;    // from palade.targets.ts
  targetFocus?: string[];
  projectLanguages: Language[];
  totalFiles: number;
  mode: ReviewMode;
}

interface AgentFinding {
  agentName: AgentName;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  symbolName?: string;
  tags: string[];
  scorePenalty: number;          // contribution to score deduction
}
```

### 6.2 Specialist Agents

| Agent | Domain | Primary Focus |
|-------|--------|---------------|
| `SecurityAgent` | Security | Entry points, auth gaps, input validation, secrets in logic, injection risks |
| `ArchitectureAgent` | Architecture | Module coupling, dependency direction, layer violations, circular deps |
| `PerformanceAgent` | Performance | N+1 patterns, unbounded loops, missing caching, sync-in-async |
| `MaintainabilityAgent` | Maintainability | Duplication, naming inconsistency, complexity hotspots, undocumented complexity |
| `DeadCodeAgent` | Dead Weight | Unused exports, zombie features, unwired implementations, stale comments |
| `TestIntelligenceAgent` | Test Coverage | Untested critical paths, test quality, mocking antipatterns |

### 6.3 Synthesis Agent

Receives the aggregated `AgentFinding[]` from all specialist agents and produces:
- Executive summary (3–5 paragraphs)
- Cross-cutting pattern observations
- Priority fix order with rationale
- Cross-target issues (if multiple targets ran)
- Final score computation

Runs on Cerebras by default (highest quality synthesis).

### 6.4 Agent System Prompt Construction

Each agent's system prompt is assembled from:
1. Domain-specific base prompt (hardcoded in agent definition)
2. Language context (`"This codebase is primarily TypeScript/Node.js"`)
3. Target context (if `--target` used): injected description + focus areas
4. Mode context (if `--mode` used): additional domain instructions
5. Scope context: total files, lines reviewed, language distribution

---

## 7. Orchestrator

### 7.1 Swarm Execution Model

```
swarm.ts

1. Receive: FileManifest[] + ChunkManifest[] + AgentContext
2. Assign chunks to agents via scheduler
3. Execute all agents in parallel (Promise.all with concurrency cap)
4. Collect: AgentFinding[][] from all agents
5. Pass to memory.ts for cross-agent sharing
6. Pass to merger.ts for deduplication
7. Pass to synthesis agent
8. Return: ReviewResult
```

### 7.2 Chunk Scheduler

Distribution strategy:
- Each specialist agent receives ALL chunks (not partitioned by file)
- Agent focuses on its domain across the full scope
- Exception: `--target` or `--dir` scoping pre-filters chunks before distribution
- Chunk batching: agent calls are batched to stay within provider context limits

```typescript
interface ScheduledBatch {
  agentName: AgentName;
  chunks: CodeChunk[];
  estimatedTokens: number;
}
```

### 7.3 Cross-Agent Memory

After all specialist agents complete, findings are shared before synthesis:

```typescript
class AgentMemory {
  private findings: Map<AgentName, AgentFinding[]>;
  
  // Called after swarm completes
  crossReference(): CrossTargetFinding[] {
    // Identify findings that reference same files/symbols across multiple agents
    // Identify pattern mismatches that only appear when comparing domains
    // Return combined cross-cutting issues
  }
}
```

### 7.4 Finding Merger

Deduplicates findings that reference the same file/line across agents. Merges severity (takes highest). Preserves all domain tags.

---

## 8. Scope Resolution

Scope is resolved before the swarm runs. Resolution order (additive, not exclusive):

```
1. .paladeignore  →  global excludes
2. --dir          →  include all files under path
3. --file         →  include specific files
4. --glob         →  include files matching pattern
5. --target       →  include files defined in target's `entry` array
6. --annotations  →  further narrow to @palade-annotated items only
7. symbol scope   →  expand to include dependency files (1 level)
8. dedup          →  remove duplicates
```

Symbol scope (`file.ts::Symbol`) adds files to scope, it does NOT remove others already in scope unless it's the only argument provided.

---

## 9. Scorer

### 9.1 Score Formula

```
finalScore = 100 - sum(finding.scorePenalty)
  clamped to [0, 100]

Per-dimension scores computed from subset of findings by tag.
```

Score penalties per severity:

| Severity | Penalty |
|----------|---------|
| Critical | 8–12 pts |
| High | 4–7 pts |
| Medium | 1–3 pts |
| Low | 0.5 pts |
| Info | 0 pts |

### 9.2 Badge Generation

SVG badge generated at `palade-badge.svg` in project root.

```
![Palade Score](./palade-badge.svg)
```

Score color: green (80–100), yellow (60–79), orange (40–59), red (0–39).

### 9.3 History

Score history appended to `.palade/history.json` on every full review:

```json
{
  "history": [
    { "date": "2025-01-15T10:30:00Z", "score": 74, "delta": -3, "runId": "abc123" },
    { "date": "2025-01-22T14:12:00Z", "score": 77, "delta": +3, "runId": "def456" }
  ]
}
```

---

## 10. Output & Reporting

### 10.1 Terminal Output

Live progress during swarm execution:

```
palade v0.1.0

  Project: my-project (312 files, 47,234 LOC)
  Scope:   full codebase
  Swarm:   6 agents → Groq (llama-3.3-70b-versatile)
  Synthesis: Cerebras

  Chunking...                        done  (312 chunks)
  ⟳ SecurityAgent                   running...
  ⟳ ArchitectureAgent               running...
  ✓ DeadCodeAgent                   done  (11 findings, 3.2s)
  ✓ TestIntelligenceAgent           done  (8 findings, 4.1s)
  ✓ PerformanceAgent                done  (6 findings, 4.4s)
  ✓ MaintainabilityAgent            done  (14 findings, 5.0s)
  ✓ SecurityAgent                   done  (9 findings, 5.3s)
  ✓ ArchitectureAgent               done  (12 findings, 5.8s)
  ⟳ Synthesis (Cerebras)...         running...
  ✓ Synthesis                       done  (6.2s)

  ────────────────────────────────────────
  Palade Score: 68/100  ↓2 from last run
  Total findings: 60  (3 critical, 11 high, 31 medium, 15 low)

  → Report:   http://localhost:4242   (opening browser...)
  → Saved:    .palade/reports/2025-01-22-68.html
  → JSON:     .palade/reports/2025-01-22-68.json
  → Badge:    palade-badge.svg updated
  ────────────────────────────────────────
  Total time: 18.4s
```

### 10.2 HTML Report Structure

The local HTML report includes:
1. Health score dashboard with dimension breakdown
2. Executive summary from synthesis agent
3. Findings table (filterable by severity, domain, file)
4. File heatmap — colour-coded by finding density
5. Ghost code section (dead code + zombie features)
6. Cross-target issues section (if applicable)
7. Score history sparkline chart
8. Technical debt estimate table

### 10.3 JSON Output Schema

```typescript
interface ReviewReport {
  meta: {
    runId: string;
    timestamp: string;
    projectRoot: string;
    scope: ScopeDescriptor;
    mode: ReviewMode;
    providers: ProviderAssignment;
    durationMs: number;
  };
  score: {
    total: number;
    delta: number | null;
    dimensions: Record<Dimension, number>;
  };
  summary: string;
  findings: AgentFinding[];
  crossTargetFindings: CrossTargetFinding[];
  debtEstimate: DebtEstimate;
  ghostReport: GhostReport;
}
```

---

## 11. CLI Command Reference

```
palade review [path]              Full codebase review
  --target <name>                 Review a named target from palade.targets.ts
  --all-targets                   Review all targets
  --dir <path>                    Scope to directory
  --file <path>                   Scope to file(s)
  --glob <pattern>                Scope to glob
  --mode <mode>                   standard|security|onboard|debt|ghost
  --annotations                   Only review @palade-annotated items
  --pick                          Interactive scope selector
  --depth <n>                     Symbol dependency trace depth (default: 1)

palade diff [--base <branch>]     Branch pre-flight review
palade watch                      Start drift detection watcher
palade score                      Show current score + history
palade targets search <query>     Search community target registry
palade targets add <pack>         Install community target pack
palade init                       Scaffold palade.config.ts + palade.targets.ts
```

---

## 12. `.paladeignore` Format

Follows `.gitignore` syntax exactly. Default ignores generated on `palade init`:

```
node_modules/
dist/
build/
.git/
*.lock
*.min.js
*.min.css
coverage/
.palade/
```

---

## 13. Community Target Registry

Target packs are published as npm packages under `@palade-targets/<name>`.

Each package exports a `PaladeTarget[]` array. `palade targets add <name>` installs the package and merges target definitions into the local `palade.targets.ts`.

Registry metadata (name, description, stars, author) hosted at `registry.palade.dev` (future), bootstrapped on npm search initially.

---

## 14. Technical Constraints

- **Node.js version:** ≥ 18 (required for native fetch and ESM)
- **Runtime:** Node.js only, no browser build
- **Language parsing:** tree-sitter (TS, JS, Python, Go, Rust supported in v0.1)
- **Concurrency:** `p-limit` for provider call concurrency control
- **CLI framework:** Commander.js
- **Interactive picker:** Inquirer.js
- **Config validation:** Zod
- **HTTP client:** Native fetch (Node 18+)
- **Local state:** `.palade/` directory in project root (added to `.gitignore` automatically)
- **No telemetry:** zero analytics, zero callbacks home, ever

---

## 15. Security Constraints

- API keys read exclusively from environment variables or `palade.config.ts`
- `palade.config.ts` added to `.gitignore` automatically on `palade init`
- No API keys ever logged, stored in `.palade/`, or included in reports
- All LLM calls are direct provider calls — no Palade proxy, no key handling server-side
- Report HTML is local-only — served on `localhost:4242`, no external hosting
