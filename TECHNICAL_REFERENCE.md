# Palade Technical Reference Manual

This document provides a highly exhaustive, line-by-line logical explanation of every single subsystem, file, and core abstraction within the Palade codebase. This is the definitive technical architecture manual.

---

## 1. Architecture Overview

Palade is a Node.js-based AI codebase intelligence engine written in TypeScript. It operates as an offline pipeline that:
1. Takes a set of target files or a `git diff`.
2. Chunks the source code semantically using AST heuristics.
3. Schedules chunks into token-optimized batches.
4. Executes a Multi-Agent LLM Swarm (Security, Architecture, Performance, etc.) in parallel against the batches.
5. Aggregates, deduplicates, and scores the findings via a Synthesis phase.
6. Reports the output as CLI feedback, interactive HTML scorecards, JSON, and Markdown.

---

## 2. CLI Layer (`src/cli/`)

This layer parses user input via `commander` and dispatches execution to core pipelines.

### `index.ts`
The main entry point. It sets up the Commander.js program, registers global options (`--debug`, `--config`), prints the ASCII banner (`src/ui/banner.ts`), and imports all subcommands. It explicitly catches global unhandled rejections to prevent silent crashes.

### `commands/review.ts`
The flagship command for reviewing code.
- **Lines 1-50**: Imports dependencies, loads configuration (`loadConfig`), and parses CLI arguments (like `--target`).
- **Target Resolution**: Uses `resolveTargetPaths` to expand glob patterns (e.g., `src/**/*.ts`) or predefined targets from `palade.targets.ts` into a strict list of absolute file paths.
- **Pipeline Execution**: Wraps `runPipeline` inside a `try/finally` block to ensure the progress UI is always stopped.
- **Scoring & Reporting**: Receives the `SwarmResult`, passes it to `calculateScore`, appends the result to `.palade/history.json`, and triggers `writeHtmlReport`, `reportJson`, etc., based on user configuration.
- **Modes**: Hooks into `src/modes/index.ts` if a specific mode (like `debt` or `onboard`) is passed.

### `commands/diff.ts`
Executes a review specifically on uncommitted changes or branch diffs.
- Uses `src/diff/git.ts` to execute `git diff` and parse the unified diff output.
- Only passes the *changed* code lines (via `comparator.ts`) into the ingestion pipeline, vastly reducing token cost.

### `commands/targets.ts`
Manages the `palade.targets.ts` file. 
- Features an AI-generation command (`generate <query>`) that uses the LLM to search the directory and auto-write a new target block into the file based on a natural language query.

### `commands/init.ts` & `settings.ts`
- **`init.ts`**: Bootstraps the project by creating `.palade/`, `.paladeignore`, and updating `.gitignore`.
- **`settings.ts`**: Provides a command-line interface to read/write specific dot-notated values in `palade.config.ts`. It uses regex to safely modify nested objects in the AST-less TypeScript file.

---

## 3. Configuration Layer (`src/config/`)

### `loader.ts`
The core configuration merger.
- **Environment Discovery**: Reads `.env` and extracts `GROQ_API_KEY`, `OPENROUTER_API_KEY`, etc.
- **Auto-Detection**: Determines which API keys are available and dynamically injects `swarm.primary` and `swarm.synthesis` defaults (e.g., if only a Groq key exists, it makes Groq the primary).
- **Deep Merging**: Merges environment variables with user-provided `palade.config.ts` objects and `DEFAULT_CONFIG`. It ensures that object properties (like provider definitions) are deeply merged rather than blindly overwritten.

### `schema.ts`
Zod schema definitions. Validates that properties like `agentCount`, `timeoutMs`, and `economyMode` are strictly typed and within acceptable integer ranges.

---

## 4. Code Ingestion & Chunking (`src/ingestion/`)

This subsystem reads source code from disk and prepares it for the LLMs.

### `walker.ts`
Recursively walks the target directories, ignoring paths defined in `.paladeignore` or `.gitignore`. It returns a flat list of `FileManifest` objects.

### `chunker.ts` & `chunker.test.ts`
LLMs have context limits. Instead of blindly slicing by character count, `chunker.ts` uses Regex/AST heuristics to chunk code semantically.
- It attempts to keep classes, functions, and interfaces fully intact.
- If a function exceeds `HARD_CHUNK_LIMIT` (3,000 tokens), it forces a split but overlaps the edges by ~10% to preserve context between chunks.

### `dependencyTracer.ts` & `symbolResolver.ts`
Scans `import` and `require` statements to trace dependencies, allowing agents to understand how chunks fit into the broader system architecture.

---

## 5. Orchestration Layer (`src/orchestrator/`)

The brain of the system that manages async execution.

### `pipeline.ts`
The high-level macro-function. 
1. Calls ingestion to get chunks.
2. Calls `scheduler.ts` to batch chunks.
3. Executes `runSwarm` (the multi-agent LLM process).
4. Returns the synthesized `SwarmResult`.

### `scheduler.ts`
Takes a massive array of `CodeChunk` objects and bins them into arrays of arrays (`CodeChunk[][]`), ensuring no single array exceeds `SOFT_TOKEN_LIMIT` (8,000 tokens). This guarantees we don't blow up the LLM context window in a single API call.

### `triage.ts`
Before wasting expensive tokens on irrelevant files, the Triage agent looks at file paths and metadata, returning a prioritized list of which chunks are most relevant to the user's intent. Deduplicates overlapping chunks using a `Set`.

### `swarm.ts`
Executes the actual parallel LLM calls.
- **Agent Initialization**: Loads built-in agents (Security, Architecture) and custom agents (`palade.agents.ts`).
- **Execution Loop**: Maps over the batches and uses `Promise.all` to query agents concurrently.
- **Resiliency**: Wraps every agent invocation in a broad `try/catch`. If an individual agent throws (e.g., JSON parse failure), it doesn't crash the swarm; it simply logs a warning and proceeds.
- **Synthesis Phase**: After all agents run, it invokes `synthesis.ts` to deduplicate overlapping findings and write an executive summary.

### `merger.ts` & `memory.ts`
- `memory.ts` stores findings in memory during the execution phase.
- `merger.ts` deduplicates identical findings (e.g., if Security and Architecture both complain about the same SQL query on line 42, they are merged into a `CrossAgentFinding`).

---

## 6. Provider Routing & APIs (`src/providers/`)

### `router.ts` (FallbackProvider)
The core HTTP resiliency layer.
- Takes a primary provider and an array of fallbacks.
- Traverses a `try/catch` loop. If an error contains retryable strings (`429`, `500`, `502`, `503`, `timeout`, `ECONNREFUSED`, `fetch failed`), it suppresses the error and seamlessly attempts the exact same request against the next provider in the chain.

### Provider Implementations (`groq.ts`, `cerebras.ts`, `nvidia.ts`, `openrouter.ts`, `opencode-zen.ts`)
Each provider implements the `IProvider` interface. They use native Node.js `fetch` to POST data to the respective LLM endpoints. They map the `CompletionRequest` into the specific JSON format expected by OpenAI-compatible endpoints or Anthropic endpoints, extract the resulting tokens, and return a standardized `CompletionResponse`.

---

## 7. Agents (`src/agents/`)

### `base.ts`
Provides the `parseFindingsResponse` utility. LLMs are notoriously bad at outputting clean JSON. This file strips markdown backticks (e.g., \`\`\`json), extracts substrings between `[` and `]`, and forces standard `JSON.parse`. It validates the resulting object against the `Severity` enums, appending a `scorePenalty` mathematically tied to the severity level.

### `specialist/*.ts`
Contains the system prompts for individual domains:
- **`security.ts`**: System prompt tuned for OWASP top 10, injection, crypto.
- **`architecture.ts`**: Tuned for SOLID principles, coupling, bounded contexts.
- **`performance.ts`**: Tuned for Big O complexity, memory leaks, N+1 queries.
- **`maintainability.ts`**: Tuned for cyclomatic complexity, naming, DRY.
- **`deadCode.ts`**: Tuned to spot unreachable branches and unused exports.

### `combined.ts` (Economy Mode)
Instead of pinging 6 agents concurrently with the exact same code chunk (which multiplies token costs by 6x), `combined.ts` merges all 6 system prompts into one giant prompt. It asks a single powerful model to output a JSON dictionary containing keys for `security`, `architecture`, etc. This significantly reduces latency and token usage at the potential cost of depth.

---

## 8. Scoring & Reporting (`src/scorer/` & `src/reporters/`)

### `calculator.ts`
Reduces the project score from a baseline of 100.
- Critical: -10 pts
- High: -5 pts
- Medium: -2 pts
- Low: -0.5 pts
Automatically bottoms out at 0. Computes the delta from the previous run (e.g., `+5` or `-12`).

### `badge.ts`
Generates a dynamic SVG badge (like the ones on GitHub). Uses hardcoded `measureTextWidth` approximations to correctly size the SVG bounding boxes without requiring a browser layout engine.

### `html.ts` (The UI Reporter)
Generates an interactive dashboard.
- **Escaping**: Aggressively uses `escapeXml` and `escapeHtml` to prevent XSS payloads in agent descriptions from breaking the HTML DOM.
- **Template Hijacking Prevention**: Reads the internal bundled template first; only allows user overrides if explicitly permitted by config.
- **Local Server**: Can spin up a fast Node `http.createServer` to serve the dashboard on `localhost:4242` and auto-opens the browser. Ensures `server.unref()` is called so the CLI process doesn't hang indefinitely after launch.

### `json.ts` & `markdown.ts`
Provides headless CI/CD integrations by dumping the raw `ReporterContext` out to machine-readable files.

---

## 9. Terminal UI (`src/tui/`)

While Palade is a standard CLI, it also ships with an experimental React-based TUI (built via `ink`).
- `app.tsx`: Renders a full terminal dashboard with a command palette.
- `useCommandRunner.ts`: Pipes stdout from executing Palade subcommands into React state arrays, enabling interactive, scrolling output panes inside the terminal natively.

---
*End of Technical Reference Manual.*
