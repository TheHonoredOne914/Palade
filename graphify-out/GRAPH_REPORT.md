# Graph Report - .  (2026-07-14)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1024 nodes · 2567 edges · 79 communities (59 shown, 20 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c0c29a05`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dependencies
- base.ts
- html.ts
- apiKey.ts
- diff.ts
- findingValidation.ts
- harness.test.ts
- types.ts
- loader.ts
- repoContext.ts
- base.ts
- history.ts
- package.json
- devDependencies
- 🤖 Palade
- review.ts
- compilerOptions
- IProvider
- layout.ts
- CLAUDE.md
- Palade Agent Quality Diagnostic — Baseline Run
- triage.test.ts
- scripts
- comparator.ts
- OllamaProvider
- hooks
- OpenAICompatibleProvider
- PreToolUse
- triage.ts
- calculator.ts
- [1.0.0-rc.1] - 2026-06-27
- swarm.ts
- AgentName
- Contributing to Palade
- router.ts
- SessionStart
- inventory
- ?? Advanced Configuration
- vulnerable.ts
- Economy Mode
- `palade watch`
- The Hybrid Swarm
- pipeline.ts
- session-start.sh
- index.ts
- Commands
- Configuration: Economy Mode
- Configure a Provider
- Getting Started
- Installation
- Interactive TUI
- contextPacks.ts
- What is Palade?
- extractImportSpecifiers
- annotationParser.ts
- badge.ts
- LiveProgress
- walker.ts
- keywords
- openrouter.ts
- app.tsx
- files
- settings.ts
- types.ts
- loader.ts
- banner.ts
- merger.ts

## God Nodes (most connected - your core abstractions)
1. `diffCommand()` - 40 edges
2. `AgentName` - 38 edges
3. `AgentFinding` - 37 edges
4. `reviewCommand()` - 34 edges
5. `CodeChunk` - 33 edges
6. `IProvider` - 24 edges
7. `loadConfig()` - 23 edges
8. `runSwarm()` - 23 edges
9. `BaseSpecialistAgent` - 21 edges
10. `runPipeline()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `buildIgnoreFilter()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `walkDir()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `CombinedAnalyzer` --references--> `AgentName`  [EXTRACTED]
  src/agents/combined.ts → src/agents/base.ts
- `DomainSpec` --references--> `AgentName`  [EXTRACTED]
  src/agents/combined.ts → src/agents/base.ts
- `CustomAgent` --references--> `AgentName`  [EXTRACTED]
  src/agents/custom/agent.ts → src/agents/base.ts

## Import Cycles
- 3-file cycle: `src/agents/custom/agent.ts -> src/agents/custom/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`

## Communities (79 total, 20 thin omitted)

### Community 0 - "dependencies"
Cohesion: 0.09
Nodes (23): chalk, chokidar, commander, dotenv, ink, ink-spinner, ink-text-input, open (+15 more)

### Community 1 - "base.ts"
Cohesion: 0.22
Nodes (14): annotateComplexity(), buildChunkContext(), buildSystemPrompt(), completeAndParseFindings(), computeMaxTokens(), isParseFailureSentinel(), parseFindingsResponse(), salvageTruncatedArray() (+6 more)

### Community 2 - "html.ts"
Cohesion: 0.06
Nodes (76): Severity, computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse(), PriorityFix, selectFindingsForSynthesis() (+68 more)

### Community 3 - "apiKey.ts"
Cohesion: 0.17
Nodes (16): ProviderId, PROVIDERS, quoteKeyIfNeeded(), resolveConfigPath(), saveApiKey(), saveConfigValue(), setNestedValue(), fetchModels() (+8 more)

### Community 4 - "diff.ts"
Cohesion: 0.19
Nodes (18): DiffContext, diffCommand(), DiffOpts, throwIfAborted(), OptionalDocResult, readOptionalProjectDoc(), getBaseScore(), getChangedFiles() (+10 more)

### Community 5 - "findingValidation.ts"
Cohesion: 0.42
Nodes (6): fingerprintFor(), getMatchingChunkAndClamp(), normalizePath(), normalizePathKey(), chunks, validateAndFingerprintFindings()

### Community 6 - "harness.test.ts"
Cohesion: 0.07
Nodes (44): ALL_DEFECTS, Defect, DefectCategory, FINDING_VALIDATION_DEFECTS, MERGER_DEFECTS, realBugCount(), SCHEDULER_DEFECTS, Severity (+36 more)

### Community 7 - "types.ts"
Cohesion: 0.06
Nodes (48): decisionsCommand(), initCommand(), runTargetsAdd(), runTargetsGenerate(), runTargetsList(), runTargetsSearch(), targetsCommand, throwIfAborted() (+40 more)

### Community 8 - "loader.ts"
Cohesion: 0.52
Nodes (3): loadCustomAgents(), CustomAgentDefinition, CustomAgentDefinitionSchema

### Community 9 - "repoContext.ts"
Cohesion: 0.19
Nodes (13): buildPublicApi(), buildRepoContext(), candidatesFor(), collectStrings(), findCycles(), isTestFile(), renderCappedList(), renderRepoContext() (+5 more)

### Community 10 - "base.ts"
Cohesion: 0.20
Nodes (15): CompletionRequest, CompletionResponse, FATAL_QUOTA_KEYWORDS, fetchWithRetry(), isDailyLimitError(), nextRetryMaxTokens(), QUOTA_ERROR_TAG, rateLimitedMessage() (+7 more)

### Community 11 - "history.ts"
Cohesion: 0.22
Nodes (13): acquireLock(), appendEntry(), getPreviousScore(), isValidCategoryScore(), parseHistoryEntries(), readHistory(), releaseLock(), sleep() (+5 more)

### Community 12 - "package.json"
Cohesion: 0.12
Nodes (16): author, bin, palade, bugs, url, description, engines, node (+8 more)

### Community 13 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, @eslint/js, devDependencies, eslint, @eslint/js, prettier, tsx, @types/node (+11 more)

### Community 14 - "🤖 Palade"
Cohesion: 0.05
Nodes (40): Palade Benchmark Report, Precision — mature libraries, Recall — planted vulnerabilities, Reliability — read this before trusting any single run, Reproduce, Setup, 🏆 Benchmarks, 🔁 CI/CD Integration (+32 more)

### Community 15 - "review.ts"
Cohesion: 0.21
Nodes (13): reviewCommand(), ReviewOptions, VALID_REPORT_FORMATS, launchPicker(), ReviewCancelledError, escapeRegex(), getLanguage(), resolveSymbol() (+5 more)

### Community 16 - "compilerOptions"
Cohesion: 0.09
Nodes (22): node_modules, src/**/*, src/**/*.test.ts, src/**/*.test.tsx, src/**/*.tsx, src/vulnerable.ts, vitest.config.ts, compilerOptions (+14 more)

### Community 17 - "IProvider"
Cohesion: 0.10
Nodes (6): IProvider, ProviderPool, FallbackProvider, markResponsibleProviderDead(), ProviderAssignment, withRoleStats()

### Community 18 - "layout.ts"
Cohesion: 0.24
Nodes (13): scoreCommand(), BLOCKS, drawBox(), formatDelta(), formatDriftAlert(), kvTable(), sectionBox(), severityChip() (+5 more)

### Community 19 - "CLAUDE.md"
Cohesion: 0.33
Nodes (4): Codebase Knowledge Graph (graphify) — Read This First, Cross-Session Memory (claude-mem) — Opt-In, graphify, Palade: Mental Model \& Architecture Guide

### Community 20 - "Palade Agent Quality Diagnostic — Baseline Run"
Cohesion: 0.15
Nodes (12): Adjudication (ground truth — full repo access), Agent 1: Security, Agent 2: Architecture, Agent 3: Performance, Agent 4: Maintainability, Agent 5: Dead Code, Agent 6: Test Intelligence, Baseline Numbers (+4 more)

### Community 22 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, clean, dev, format, format:check, graph:update, lint (+7 more)

### Community 23 - "comparator.ts"
Cohesion: 0.25
Nodes (11): addedLineRanges(), buildFingerprint(), buildLooseFingerprint(), compareFindings(), findingOverlapsAdded(), rankIntroducedFindings(), scopeToDiff(), changed (+3 more)

### Community 26 - "OpenAICompatibleProvider"
Cohesion: 0.12
Nodes (10): CerebrasProvider, CONFIG, CONFIG, GroqProvider, CONFIG, NvidiaProvider, OpenAICompatibleConfig, OpenAICompatibleProvider (+2 more)

### Community 28 - "triage.ts"
Cohesion: 0.36
Nodes (6): FileManifest, estimateTotalTokens(), heuristicSelect(), scoreManifestForReview(), triageFiles(), extractBalancedJson()

### Community 29 - "calculator.ts"
Cohesion: 0.10
Nodes (28): SEVERITY_PENALTY, DEFAULT_CONFIG, PaladeConfig, ProviderConfigSchema, ProviderNameSchema, NOTE: applied PER-KIND, not to the combined file total — 'full' and, ReportFormatSchema, EstimateResult (+20 more)

### Community 30 - "[1.0.0-rc.1] - 2026-06-27"
Cohesion: 0.25
Nodes (7): [1.0.0-rc.1] - 2026-06-27, [1.0.0-rc.2] - 2026-07-07, Added, Changed, Changelog, Fixed, Security

### Community 31 - "swarm.ts"
Cohesion: 0.13
Nodes (21): AgentFinding, applyLineIgnores(), AgentMemory, linesAreNear(), scheduleBatches(), runSwarm(), SwarmOptions, arbitrateConflict() (+13 more)

### Community 32 - "AgentName"
Cohesion: 0.14
Nodes (14): AgentName, DummyAgent, BaseSpecialistAgent, AGENT_REGISTRY, BUILTIN_AGENTS, getAgentsForMode(), ArchitectureAgent, DeadCodeAgent (+6 more)

### Community 33 - "Contributing to Palade"
Cohesion: 0.33
Nodes (5): Architecture and Scope, Contributing to Palade, Pull Request Process, Setting Up For Development, Testing

### Community 34 - "router.ts"
Cohesion: 0.11
Nodes (15): AuthError, isFatalAuthError(), PoolSourceTaggedError, PROVIDER_POOL_SOURCE, agentAssignments, allProviders, AllProvidersExhaustedError, createProviderInstances() (+7 more)

### Community 52 - "pipeline.ts"
Cohesion: 0.30
Nodes (11): buildAnnotationSummary(), parseFile(), buildKeywordIndex(), getKeywordContext(), IndexedChunk, ScopeOptions, contextBlockKey(), mergeContexts() (+3 more)

### Community 54 - "index.ts"
Cohesion: 0.30
Nodes (7): ReviewMode, DEBT_MODE, GHOST_MODE, ModeConfig, MODES, ONBOARD_MODE, SECURITY_MODE

### Community 61 - "contextPacks.ts"
Cohesion: 0.39
Nodes (10): buildRetrievedContext(), expectedTestBases(), getIdentifierTerms(), identifierTerms(), identifierTermsCache, resolveRelativeImport(), scoreRelatedChunk(), toPosix() (+2 more)

### Community 63 - "extractImportSpecifiers"
Cohesion: 0.29
Nodes (8): extractLocalImports(), normalizePath(), resolveImport(), extractGoImports(), extractImportSpecifiers(), extractViaAst(), extractViaRegex(), LANGUAGE_IMPORT_PATTERNS

### Community 64 - "annotationParser.ts"
Cohesion: 0.25
Nodes (8): AnnotationSummary, FILE_IGNORE_RE, FOCUS_RE, IGNORE_RE, parseFileAsync(), REVIEW_RE, stripStringLiterals(), Annotation

### Community 65 - "badge.ts"
Cohesion: 0.39
Nodes (7): COLOR_MAP, escapeXml(), getBadgeData(), getScoreColor(), measureTextWidth(), renderBadge(), BadgeData

### Community 67 - "walker.ts"
Cohesion: 0.23
Nodes (12): ignore, ignore, watchCommand(), LanguageProfile, buildIgnoreFilter(), DEFAULT_IGNORES, detectLanguage(), EXT_MAP (+4 more)

### Community 68 - "keywords"
Cohesion: 0.25
Nodes (8): keywords, ai, cli, code-review, codebase, health-score, static-analysis, swarm

### Community 69 - "openrouter.ts"
Cohesion: 0.33
Nodes (3): DEFAULT_REFERER, __dirname, OpenRouterProvider

### Community 70 - "app.tsx"
Cohesion: 0.14
Nodes (13): readCurrentKeys(), App(), SafeInputHandlerProps, CommandInput(), CommandInputProps, OutputLine, OutputLineItem(), useCommandHistory() (+5 more)

### Community 71 - "files"
Cohesion: 0.40
Nodes (5): files, dist/, CHANGELOG.md, README.md, templates/

### Community 77 - "settings.ts"
Cohesion: 0.30
Nodes (12): applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand(), SettingsOptions, showCurrentConfig() (+4 more)

### Community 81 - "types.ts"
Cohesion: 0.14
Nodes (13): AgentContext, IAgent, AGENT_NAME_ALIASES, attributeFindings(), buildCombinedSystemPrompt(), CombinedAnalyzer, DEFAULT_DOMAINS, DOMAIN_GUARDRAILS (+5 more)

### Community 91 - "loader.ts"
Cohesion: 0.21
Nodes (13): BUILTIN_NAMES, isProviderConfigured(), buildEnvConfig(), collectKeys(), expandProviderShares(), formatZodError(), loadConfig(), PaladeConfigSchema (+5 more)

### Community 93 - "banner.ts"
Cohesion: 0.24
Nodes (7): Header(), HeaderProps, ASCII_ART, GRADIENT, BannerOptions, printBanner(), renderAscii()

### Community 102 - "merger.ts"
Cohesion: 0.15
Nodes (13): highestSeverity(), SEVERITY_ORDER, isNearMatch(), jaccardSimilarity(), mergeFindings(), mergeTwo(), NearMatchOptions, SEVERITY_RANK (+5 more)

## Knowledge Gaps
- **261 isolated node(s):** `session-start.sh script`, `PATH`, `name`, `version`, `description` (+256 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `walker.ts`, `package.json`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `ignore` connect `walker.ts` to `dependencies`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Why does `buildIgnoreFilter()` connect `walker.ts` to `types.ts`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **What connects `session-start.sh script`, `PATH`, `name` to the rest of the system?**
  _263 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `html.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.057738572574178026 - nodes in this community are weakly interconnected._
- **Should `harness.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._