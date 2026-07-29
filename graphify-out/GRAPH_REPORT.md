# Graph Report - .  (2026-07-29)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1047 nodes · 2678 edges · 73 communities (53 shown, 20 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `870ba961`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- calculator.ts
- errors/types.ts
- html.ts
- settings.ts
- diff.ts
- scripts
- harness.test.ts
- useCommandRunner.ts
- review.ts
- repoContext.ts
- providers/base.ts
- devDependencies
- package.json
- ingestion/types.ts
- Palade Benchmark Report
- openrouter.ts
- compilerOptions
- pool.ts
- LiveProgress
- Palade: Mental Model & Architecture Guide
- Palade Agent Quality Diagnostic — Baseline Run
- triage.test.ts
- IProvider
- custom/loader.ts
- OllamaProvider
- scripts
- openaiCompatible.ts
- devDependencies
- swarm.ts
- AgentFinding
- [1.0.0-rc.1] - 2026-06-27
- keywords
- agents/base.ts
- Contributing to Palade
- router.ts
- SessionStart
- repository
- prompt.ts
- vulnerable.ts
- Economy Mode
- review.ts
- The Hybrid Swarm
- estimator.ts
- session-start.sh
- chunker.ts
- Commands
- Configuration: Economy Mode
- Configure a Provider
- Getting Started
- Installation
- Interactive TUI
- pipeline.ts
- What is Palade?
- scheduler.ts
- files
- symbolResolver.ts
- contextPacks.ts
- dependencies
- watch.ts
- extractImportSpecifiers
- banner.ts

## God Nodes (most connected - your core abstractions)
1. `AgentName` - 38 edges
2. `AgentFinding` - 37 edges
3. `diffCommand()` - 35 edges
4. `reviewCommand()` - 34 edges
5. `CodeChunk` - 34 edges
6. `IProvider` - 25 edges
7. `runSwarm()` - 24 edges
8. `loadConfig()` - 23 edges
9. `BaseSpecialistAgent` - 21 edges
10. `runPipeline()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `buildIgnoreFilter()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `walkDir()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `Conflict` --references--> `AgentFinding`  [EXTRACTED]
  src/orchestrator/verdict.ts → src/agents/base.ts
- `CombinedAnalyzer` --references--> `AgentName`  [EXTRACTED]
  src/agents/combined.ts → src/agents/base.ts
- `CustomAgent` --references--> `AgentName`  [EXTRACTED]
  src/agents/custom/agent.ts → src/agents/base.ts

## Import Cycles
- 3-file cycle: `src/agents/custom/agent.ts -> src/agents/custom/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`
- 4-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/architecture.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/deadCode.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/logic.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/maintainability.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/performance.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/pragmatism.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/security.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/testIntelligence.ts -> src/agents/base.ts`

## Communities (73 total, 20 thin omitted)

### Community 0 - "calculator.ts"
Cohesion: 0.12
Nodes (24): DEFAULT_COMPLEXITY_PENALTIES, DEFAULT_CONFIG, DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS, DEFAULT_PENALTY_CAPS, DefaultConfigType, SEVERITY_PENALTY, ProviderConfigSchema, ProviderNameSchema (+16 more)

### Community 1 - "errors/types.ts"
Cohesion: 0.16
Nodes (8): CliExitError, NoProvidersError, OllamaNotRunningError, PaladeConfigError, ReviewCancelledError, SwarmTimeoutError, TargetNotFoundError, WorkspaceTooLargeError

### Community 2 - "html.ts"
Cohesion: 0.05
Nodes (77): scoreCommand(), groupBySeverity(), BADGE_COLOR_HEX, buildTemplateData(), __dirname, escapeHtml(), formatDeltaText(), getScoreColor() (+69 more)

### Community 3 - "settings.ts"
Cohesion: 0.08
Nodes (45): BUILTIN_NAMES, initCommand(), applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand() (+37 more)

### Community 4 - "diff.ts"
Cohesion: 0.08
Nodes (38): DiffContext, diffCommand(), DiffOpts, throwIfAborted(), OptionalDocResult, readOptionalProjectDoc(), addedLineRanges(), buildFingerprint() (+30 more)

### Community 5 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, clean, dev, format, format:check, graph:update, lint (+8 more)

### Community 6 - "harness.test.ts"
Cohesion: 0.09
Nodes (32): ALL_DEFECTS, Defect, DefectCategory, FINDING_VALIDATION_DEFECTS, MERGER_DEFECTS, realBugCount(), SCHEDULER_DEFECTS, Severity (+24 more)

### Community 7 - "useCommandRunner.ts"
Cohesion: 0.05
Nodes (56): decisionsCommand(), runTargetsAdd(), runTargetsGenerate(), runTargetsList(), runTargetsSearch(), targetsCommand, throwIfAborted(), VALUE_FLAG_STRINGS (+48 more)

### Community 8 - "review.ts"
Cohesion: 0.15
Nodes (22): ignore, ignore, reviewCommand(), ReviewOptions, launchPicker(), Language, LanguageProfile, buildIgnoreFilter() (+14 more)

### Community 9 - "repoContext.ts"
Cohesion: 0.19
Nodes (13): buildPublicApi(), buildRepoContext(), candidatesFor(), collectStrings(), findCycles(), isTestFile(), renderCappedList(), renderRepoContext() (+5 more)

### Community 10 - "providers/base.ts"
Cohesion: 0.27
Nodes (11): CompletionRequest, CompletionResponse, configureRetryBackoff(), FATAL_QUOTA_KEYWORDS, fetchWithRetry(), isDailyLimitError(), nextRetryMaxTokens(), QUOTA_ERROR_TAG (+3 more)

### Community 11 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, @eslint/js, devDependencies, eslint, @eslint/js, prettier, tsx, @types/node (+11 more)

### Community 12 - "package.json"
Cohesion: 0.12
Nodes (16): author, bin, palade, bugs, url, description, engines, node (+8 more)

### Community 13 - "ingestion/types.ts"
Cohesion: 0.19
Nodes (10): AnnotationSummary, FILE_IGNORE_RE, FOCUS_RE, IGNORE_RE, parseFile(), parseFileAsync(), REVIEW_RE, stripStringLiterals() (+2 more)

### Community 14 - "Palade Benchmark Report"
Cohesion: 0.29
Nodes (6): Palade Benchmark Report, Precision — mature libraries, Recall — planted vulnerabilities, Reliability — read this before trusting any single run, Reproduce, Setup

### Community 15 - "openrouter.ts"
Cohesion: 0.33
Nodes (3): DEFAULT_REFERER, __dirname, OpenRouterProvider

### Community 16 - "compilerOptions"
Cohesion: 0.09
Nodes (22): node_modules, src/**/*, src/**/*.test.ts, src/**/*.test.tsx, src/**/*.tsx, src/vulnerable.ts, vitest.config.ts, compilerOptions (+14 more)

### Community 17 - "pool.ts"
Cohesion: 0.21
Nodes (6): AuthError, tagQuotaError(), PoolSourceTaggedError, PROVIDER_POOL_SOURCE, ProviderPool, dummyReq

### Community 19 - "Palade: Mental Model & Architecture Guide"
Cohesion: 0.09
Nodes (20): Code Patterns to Recognize (No Detailed Read-Through Needed), Codebase Knowledge Graph (graphify) — Read This First, Common Failure Modes (Things to Watch), Configuration & Customization, Cross-Session Memory (claude-mem) — Opt-In, Entry Points & Control Flow, File Skip List (Don't Waste Tokens Reading These), graphify (+12 more)

### Community 20 - "Palade Agent Quality Diagnostic — Baseline Run"
Cohesion: 0.15
Nodes (12): Adjudication (ground truth — full repo access), Agent 1: Security, Agent 2: Architecture, Agent 3: Performance, Agent 4: Maintainability, Agent 5: Dead Code, Agent 6: Test Intelligence, Baseline Numbers (+4 more)

### Community 22 - "IProvider"
Cohesion: 0.11
Nodes (6): IProvider, probeAuthLive(), FallbackProvider, markResponsibleProviderDead(), ProviderAssignment, dummyReq

### Community 23 - "custom/loader.ts"
Cohesion: 0.33
Nodes (3): loadCustomAgents(), CustomAgentDefinition, CustomAgentDefinitionSchema

### Community 26 - "openaiCompatible.ts"
Cohesion: 0.10
Nodes (15): rateLimitedMessage(), CerebrasProvider, CONFIG, CONFIG, GroqProvider, CONFIG, NvidiaProvider, OpenAIChoice (+7 more)

### Community 28 - "swarm.ts"
Cohesion: 0.28
Nodes (12): IAgent, CombinedAnalyzer, DEFAULT_DOMAINS, CustomAgent, applyLineIgnores(), applyEconomyRouting(), runSwarm(), SwarmOptions (+4 more)

### Community 29 - "AgentFinding"
Cohesion: 0.05
Nodes (59): AgentFinding, Severity, stripCoT(), computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse() (+51 more)

### Community 30 - "[1.0.0-rc.1] - 2026-06-27"
Cohesion: 0.25
Nodes (7): [1.0.0-rc.1] - 2026-06-27, [1.0.0-rc.2] - 2026-07-07, Added, Changed, Changelog, Fixed, Security

### Community 31 - "keywords"
Cohesion: 0.25
Nodes (8): keywords, ai, cli, code-review, codebase, health-score, static-analysis, swarm

### Community 32 - "agents/base.ts"
Cohesion: 0.07
Nodes (47): AgentContext, AgentName, DummyAgent, annotateComplexity(), BaseSpecialistAgent, buildChunkContext(), buildSystemPrompt(), completeAndParseFindings() (+39 more)

### Community 33 - "Contributing to Palade"
Cohesion: 0.33
Nodes (5): Architecture and Scope, Contributing to Palade, Pull Request Process, Setting Up For Development, Testing

### Community 34 - "router.ts"
Cohesion: 0.13
Nodes (14): agentAssignments, allProviders, AllProvidersExhaustedError, createProviderInstances(), FallbackStats, instantiateProviders(), PROVIDER_FACTORIES, ProviderConfig (+6 more)

### Community 52 - "estimator.ts"
Cohesion: 0.43
Nodes (5): EstimateResult, estimateRunCost(), getProviderModelKey(), lookupPrice(), PRICING_TABLE

### Community 54 - "chunker.ts"
Cohesion: 0.29
Nodes (12): calculateComplexityForNodes(), chunkByAST(), chunkByBrackets(), chunkFiles(), chunkOneFile(), getTopLevelSymbolName(), hardSplitBudget(), isComplexityNode() (+4 more)

### Community 61 - "pipeline.ts"
Cohesion: 0.26
Nodes (11): injectContextAndSplit(), buildKeywordIndex(), getKeywordContext(), IndexedChunk, CODE_STOP_WORDS, CodeChunk, ScopeOptions, contextBlockKey() (+3 more)

### Community 63 - "scheduler.ts"
Cohesion: 0.31
Nodes (7): estimateTotalTokens(), scheduleBatches(), heuristicSelect(), scoreManifestForReview(), triageFiles(), extractBalancedJson(), salvageJsonStringArray()

### Community 64 - "files"
Cohesion: 0.40
Nodes (5): files, dist/, CHANGELOG.md, README.md, templates/

### Community 65 - "symbolResolver.ts"
Cohesion: 0.83
Nodes (3): escapeRegex(), getLanguage(), resolveSymbol()

### Community 66 - "contextPacks.ts"
Cohesion: 0.38
Nodes (9): buildRetrievedContext(), expectedTestBases(), getIdentifierTerms(), identifierTerms(), identifierTermsCache, resolveRelativeImport(), scoreRelatedChunk(), toPosix() (+1 more)

### Community 67 - "dependencies"
Cohesion: 0.09
Nodes (23): chalk, chokidar, commander, dotenv, ink, ink-spinner, ink-text-input, open (+15 more)

### Community 68 - "watch.ts"
Cohesion: 0.20
Nodes (6): AGENT_REGISTRY, getAgentsForMode(), DEBOUNCE_MS, watchCommand(), WatchController, applyEconomyLimits()

### Community 69 - "extractImportSpecifiers"
Cohesion: 0.29
Nodes (8): extractLocalImports(), normalizePath(), resolveImport(), extractGoImports(), extractImportSpecifiers(), extractViaAst(), extractViaRegex(), LANGUAGE_IMPORT_PATTERNS

### Community 93 - "banner.ts"
Cohesion: 0.24
Nodes (7): Header(), HeaderProps, ASCII_ART, GRADIENT, BannerOptions, printBanner(), renderAscii()

## Knowledge Gaps
- **257 isolated node(s):** `session-start.sh script`, `PATH`, `name`, `version`, `description` (+252 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `review.ts`, `package.json`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Why does `ignore` connect `review.ts` to `dependencies`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Why does `buildIgnoreFilter()` connect `review.ts` to `watch.ts`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **What connects `session-start.sh script`, `PATH`, `name` to the rest of the system?**
  _257 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `calculator.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12413793103448276 - nodes in this community are weakly interconnected._
- **Should `html.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05054945054945055 - nodes in this community are weakly interconnected._
- **Should `settings.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07597895967270601 - nodes in this community are weakly interconnected._