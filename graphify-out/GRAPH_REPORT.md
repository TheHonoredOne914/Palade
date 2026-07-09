# Graph Report - .  (2026-07-09)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 794 nodes · 2276 edges · 32 communities (28 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `05da891b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28

## God Nodes (most connected - your core abstractions)
1. `diffCommand()` - 41 edges
2. `AgentName` - 37 edges
3. `AgentFinding` - 36 edges
4. `reviewCommand()` - 34 edges
5. `CodeChunk` - 30 edges
6. `IProvider` - 30 edges
7. `CompletionRequest` - 24 edges
8. `CompletionResponse` - 24 edges
9. `loadConfig()` - 22 edges
10. `BaseSpecialistAgent` - 21 edges

## Surprising Connections (you probably didn't know these)
- `buildIgnoreFilter()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `walkDir()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `Conflict` --references--> `AgentFinding`  [EXTRACTED]
  src/orchestrator/verdict.ts → src/agents/base.ts
- `diffCommand()` --indirect_call--> `chunk()`  [INFERRED]
  src/cli/commands/diff.ts → src/ingestion/contextPacks.test.ts
- `chunkFiles()` --indirect_call--> `manifest()`  [INFERRED]
  src/ingestion/chunker.ts → src/orchestrator/triage-risk.test.ts

## Import Cycles
- 3-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/base.ts`
- 3-file cycle: `src/agents/custom/agent.ts -> src/agents/custom/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`
- 4-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/orchestrator/types.ts -> src/agents/base.ts`

## Communities (32 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (57): decisionsCommand(), runTargetsAdd(), runTargetsGenerate(), runTargetsList(), runTargetsSearch(), targetsCommand, throwIfAborted(), VALUE_FLAGS (+49 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (41): AgentFinding, AgentName, DummyAgent, BaseSpecialistAgent, loadCustomAgents(), CustomAgentDefinition, CustomAgentDefinitionSchema, AGENT_REGISTRY (+33 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (65): AnnotationSummary, DiffContext, diffCommand(), DiffOpts, throwIfAborted(), OptionalDocResult, readOptionalProjectDoc(), rankIntroducedFindings() (+57 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (36): AgentContext, annotateComplexity(), buildChunkContext(), buildSystemPrompt(), computeMaxTokens(), IAgent, parseFindingsResponse(), salvageTruncatedArray() (+28 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (54): count_lines(), extract_exports(), Extract all export names from a TypeScript file., Count non-empty lines in file., Severity, buildTemplateData(), __dirname, escapeHtml() (+46 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (32): initCommand(), applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand(), SettingsOptions (+24 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (39): author, bin, palade, bugs, url, description, devDependencies, eslint (+31 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (31): dependencies, chalk, chokidar, commander, dotenv, ignore, ink, ink-spinner (+23 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (21): addedLineRanges(), buildFingerprint(), buildLooseFingerprint(), compareFindings(), findingOverlapsAdded(), scopeToDiff(), changed, ChangedFile (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (22): computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse(), PriorityFix, selectFindingsForSynthesis(), synthesize() (+14 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (6): createLimiter(), CerebrasProvider, NvidiaProvider, OllamaProvider, OpenCodeZenProvider, OpenRouterProvider

### Community 11 - "Community 11"
Cohesion: 0.31
Nodes (8): CompletionRequest, CompletionResponse, FATAL_QUOTA_KEYWORDS, fetchWithRetry(), isDailyLimitError(), nextRetryMaxTokens(), shouldRetryEmptyContent(), sleep()

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (14): isFatalAuthError(), allProviders, createProviderInstances(), FallbackProvider, FallbackStats, instantiateProviders(), isFatalMessage(), ProviderAssignment (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (8): AuthError, NoProvidersError, OllamaNotRunningError, SwarmTimeoutError, TargetNotFoundError, WorkspaceTooLargeError, AllProvidersExhaustedError, dummyReq

### Community 14 - "Community 14"
Cohesion: 0.23
Nodes (12): reviewCommand(), ReviewOptions, VALID_REPORT_FORMATS, ReviewCancelledError, escapeRegex(), getLanguage(), resolveSymbol(), detectLanguages() (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (10): ReviewMode, DEBT_MODE, GHOST_MODE, getModeConfig(), ModeConfig, MODES, validateMode(), ONBOARD_MODE (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, jsx, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.31
Nodes (12): scoreCommand(), BLOCKS, drawBox(), formatDelta(), formatDriftAlert(), kvTable(), scoreGrade(), sectionBox() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (12): acquireLock(), appendEntry(), isValidCategoryScore(), parseHistoryEntries(), releaseLock(), sleep(), writeHistory(), BadgeColor (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.24
Nodes (7): Header(), HeaderProps, ASCII_ART, GRADIENT, BannerOptions, printBanner(), renderAscii()

### Community 21 - "Community 21"
Cohesion: 0.31
Nodes (7): COLOR_MAP, escapeXml(), getBadgeData(), getScoreColor(), measureTextWidth(), renderBadge(), SCORE_THRESHOLDS

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (4): GroqProvider, OpenAIChoice, OpenAIResponse, OpenAIUsage

### Community 23 - "Community 23"
Cohesion: 0.47
Nodes (8): formatDelta(), printDiffSummary(), renderCategoryScore(), renderFinding(), renderScoreBar(), reportTerminal(), SEVERITY_COLORS, scoreTheme()

### Community 25 - "Community 25"
Cohesion: 0.29
Nodes (6): configIdx, __dirname, launchTUI(), pkg, rawArgs, runClassicCLI()

### Community 26 - "Community 26"
Cohesion: 0.50
Nodes (3): OpenAIChoice, OpenAIResponse, OpenAIUsage

## Knowledge Gaps
- **136 isolated node(s):** `name`, `version`, `description`, `type`, `url` (+131 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 7` to `Community 6`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `buildIgnoreFilter()` connect `Community 7` to `Community 3`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **What connects `Extract all export names from a TypeScript file.`, `Count non-empty lines in file.`, `name` to the rest of the system?**
  _139 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0519219736087206 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.060759493670886074 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06518987341772152 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.08472344161545214 - nodes in this community are weakly interconnected._