# Graph Report - .  (2026-07-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 932 nodes · 2528 edges · 63 communities (47 shown, 16 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a91e733f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- router.ts
- AgentName
- html.ts
- app.tsx
- diff.ts
- settings.ts
- harness.test.ts
- types.ts
- types.ts
- repoContext.ts
- base.ts
- schema.ts
- package.json
- pipeline.ts
- 🤖 Palade
- base.ts
- Community 16
- loader.ts
- review.ts
- banner.ts
- Palade Agent Quality Diagnostic — Baseline Run
- triage.test.ts
- dependencies
- annotationParser.ts
- apiKey.ts
- scripts
- createLimiter
- devDependencies
- combined.ts
- calculator.ts
- [1.0.0-rc.1] - 2026-06-27
- AgentFinding
- runClassicCLI
- Contributing to Palade
- ProviderPool
- targets.ts
- repository
- vulnerable.ts
- useCommandRunner.ts
- index.ts
- NvidiaProvider
- findingValidation.ts
- initRouter
- OpenCodeZenProvider
- OpenRouterProvider
- sanitize.ts
- session-start.sh
- inventory
- Commands
- Configuration: Economy Mode
- Configure a Provider
- Getting Started
- Installation
- Interactive TUI
- `palade targets`
- What is Palade?

## God Nodes (most connected - your core abstractions)
1. `diffCommand()` - 40 edges
2. `AgentName` - 37 edges
3. `AgentFinding` - 37 edges
4. `reviewCommand()` - 34 edges
5. `CodeChunk` - 34 edges
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
- `CombinedAnalyzer` --references--> `AgentName`  [EXTRACTED]
  src/agents/combined.ts → src/agents/base.ts
- `DomainSpec` --references--> `AgentName`  [EXTRACTED]
  src/agents/combined.ts → src/agents/base.ts
- `CustomAgent` --references--> `AgentName`  [EXTRACTED]
  src/agents/custom/agent.ts → src/agents/base.ts

## Import Cycles
- 3-file cycle: `src/agents/custom/agent.ts -> src/agents/custom/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`
- 3-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/base.ts`
- 4-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/orchestrator/types.ts -> src/agents/base.ts`

## Communities (63 total, 16 thin omitted)

### Community 0 - "router.ts"
Cohesion: 0.07
Nodes (23): FATAL_QUOTA_KEYWORDS, IProvider, isQuotaTaggedError(), isFatalAuthError(), PoolSourceTaggedError, PROVIDER_POOL_SOURCE, agentAssignments, allProviders (+15 more)

### Community 1 - "AgentName"
Cohesion: 0.14
Nodes (14): AgentName, DummyAgent, BaseSpecialistAgent, AGENT_REGISTRY, BUILTIN_AGENTS, getAgentsForMode(), ArchitectureAgent, DeadCodeAgent (+6 more)

### Community 2 - "html.ts"
Cohesion: 0.06
Nodes (63): Severity, computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse(), PriorityFix, selectFindingsForSynthesis() (+55 more)

### Community 3 - "app.tsx"
Cohesion: 0.15
Nodes (12): App(), SafeInputHandlerProps, CommandInput(), CommandInputProps, OutputLine, OutputLineItem(), useCommandHistory(), NOTE: lines must stay append-only (no front truncation). Ink's <Static> (+4 more)

### Community 4 - "diff.ts"
Cohesion: 0.07
Nodes (50): ignore, DiffContext, diffCommand(), DiffOpts, throwIfAborted(), OptionalDocResult, readOptionalProjectDoc(), getBaseScore() (+42 more)

### Community 5 - "settings.ts"
Cohesion: 0.17
Nodes (20): initCommand(), applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand(), SettingsOptions (+12 more)

### Community 6 - "harness.test.ts"
Cohesion: 0.07
Nodes (43): ALL_DEFECTS, Defect, DefectCategory, FINDING_VALIDATION_DEFECTS, MERGER_DEFECTS, realBugCount(), SCHEDULER_DEFECTS, Severity (+35 more)

### Community 7 - "types.ts"
Cohesion: 0.26
Nodes (9): ResolvedTarget, generateTarget(), loadTargets(), resolveTargetPaths(), TargetDefinition, TargetDefinitionSchema, Autocomplete(), AutocompleteProps (+1 more)

### Community 8 - "types.ts"
Cohesion: 0.15
Nodes (9): handleFatalError(), CliExitError, NoProvidersError, OllamaNotRunningError, PaladeConfigError, ReviewCancelledError, SwarmTimeoutError, TargetNotFoundError (+1 more)

### Community 9 - "repoContext.ts"
Cohesion: 0.19
Nodes (13): buildPublicApi(), buildRepoContext(), candidatesFor(), collectStrings(), findCycles(), isTestFile(), renderCappedList(), renderRepoContext() (+5 more)

### Community 10 - "base.ts"
Cohesion: 0.25
Nodes (17): AuthError, CompletionRequest, CompletionResponse, fetchWithRetry(), isDailyLimitError(), nextRetryMaxTokens(), QUOTA_ERROR_TAG, rateLimitedMessage() (+9 more)

### Community 11 - "schema.ts"
Cohesion: 0.20
Nodes (12): SEVERITY_PENALTY, DEFAULT_CONFIG, PaladeConfig, ProviderConfigSchema, ReportFormatSchema, EstimateResult, estimateRunCost(), getProviderModelKey() (+4 more)

### Community 12 - "package.json"
Cohesion: 0.12
Nodes (15): author, bin, palade, bugs, url, description, engines, node (+7 more)

### Community 13 - "pipeline.ts"
Cohesion: 0.19
Nodes (15): applyLineIgnores(), CodeChunk, FileManifest, ScopeOptions, PipelineOptions, estimateTotalTokens(), SplitResult, runSwarm() (+7 more)

### Community 14 - "🤖 Palade"
Cohesion: 0.15
Nodes (12): ?? Advanced Configuration, ??? CLI Commands, Economy Mode, 🤖 Palade, `palade diff`, `palade review`, `palade score`, `palade watch` (+4 more)

### Community 15 - "base.ts"
Cohesion: 0.24
Nodes (13): AgentContext, annotateComplexity(), buildChunkContext(), buildSystemPrompt(), computeMaxTokens(), parseFindingsResponse(), salvageTruncatedArray(), unparsableResponseFinding() (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, jsx, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 17 - "loader.ts"
Cohesion: 0.29
Nodes (4): loadCustomAgents(), CustomAgentDefinition, CustomAgentDefinitionSchema, BUILTIN_NAMES

### Community 18 - "review.ts"
Cohesion: 0.06
Nodes (57): reviewCommand(), ReviewOptions, VALID_REPORT_FORMATS, scoreCommand(), escapeRegex(), getLanguage(), resolveSymbol(), getModeConfig() (+49 more)

### Community 19 - "banner.ts"
Cohesion: 0.24
Nodes (7): Header(), HeaderProps, ASCII_ART, GRADIENT, BannerOptions, printBanner(), renderAscii()

### Community 20 - "Palade Agent Quality Diagnostic — Baseline Run"
Cohesion: 0.15
Nodes (12): Adjudication (ground truth — full repo access), Agent 1: Security, Agent 2: Architecture, Agent 3: Performance, Agent 4: Maintainability, Agent 5: Dead Code, Agent 6: Test Intelligence, Baseline Numbers (+4 more)

### Community 22 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, chalk, chokidar, commander, dotenv, ink, ink-spinner, ink-text-input (+4 more)

### Community 23 - "annotationParser.ts"
Cohesion: 0.29
Nodes (7): AnnotationSummary, parseAnnotations(), parseAnnotationsAsync(), parseFile(), parseFileAsync(), stripStringLiterals(), Annotation

### Community 24 - "apiKey.ts"
Cohesion: 0.17
Nodes (16): ProviderId, PROVIDERS, readCurrentKeys(), resolveConfigPath(), saveApiKey(), saveConfigValue(), setNestedValue(), fetchModels() (+8 more)

### Community 25 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, clean, dev, format, format:check, graph:update, lint (+4 more)

### Community 26 - "createLimiter"
Cohesion: 0.13
Nodes (4): createLimiter(), CerebrasProvider, GroqProvider, OllamaProvider

### Community 27 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, @eslint/js, prettier, tsx, @types/node, @types/react, typescript (+2 more)

### Community 28 - "combined.ts"
Cohesion: 0.20
Nodes (12): IAgent, AGENT_NAME_ALIASES, attributeFindings(), CombinedAnalyzer, DEFAULT_DOMAINS, DOMAIN_GUARDRAILS, DomainSpec, normalizeAgentName() (+4 more)

### Community 29 - "calculator.ts"
Cohesion: 0.23
Nodes (13): applyComplexityMultiplier(), calculateCategoryScore(), calculateCrossAgentPenalty(), calculateScore(), calculateTotalPenalty(), ComplexityPenalties, countBySeverity(), CrossAgentPenaltyWeights (+5 more)

### Community 30 - "[1.0.0-rc.1] - 2026-06-27"
Cohesion: 0.25
Nodes (7): [1.0.0-rc.1] - 2026-06-27, [1.0.0-rc.2] - 2026-07-07, Added, Changed, Changelog, Fixed, Security

### Community 31 - "AgentFinding"
Cohesion: 0.07
Nodes (41): AgentFinding, addedLineRanges(), buildFingerprint(), buildLooseFingerprint(), compareFindings(), findingOverlapsAdded(), rankIntroducedFindings(), scopeToDiff() (+33 more)

### Community 32 - "runClassicCLI"
Cohesion: 0.28
Nodes (7): VALUE_FLAG_STRINGS, configIdx, __dirname, launchTUI(), pkg, rawArgs, runClassicCLI()

### Community 33 - "Contributing to Palade"
Cohesion: 0.33
Nodes (5): Architecture and Scope, Contributing to Palade, Pull Request Process, Setting Up For Development, Testing

### Community 35 - "targets.ts"
Cohesion: 0.31
Nodes (11): runTargetsAdd(), runTargetsGenerate(), runTargetsSearch(), targetsCommand, throwIfAborted(), appendTargetToFile(), fetchWithTimeout(), getTargetFromRegistry() (+3 more)

### Community 36 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 45 - "useCommandRunner.ts"
Cohesion: 0.32
Nodes (9): decisionsCommand(), runTargetsList(), VALUE_FLAGS, formatErrorMessages(), COMMAND_REGISTRY, CommandDef, CommandRunnerOptions, printHelp() (+1 more)

### Community 46 - "index.ts"
Cohesion: 0.36
Nodes (6): ReviewMode, DEBT_MODE, GHOST_MODE, ModeConfig, MODES, SECURITY_MODE

### Community 48 - "findingValidation.ts"
Cohesion: 0.42
Nodes (6): fingerprintFor(), getMatchingChunkAndClamp(), normalizePath(), normalizePathKey(), chunks, validateAndFingerprintFindings()

### Community 49 - "initRouter"
Cohesion: 0.38
Nodes (6): isProviderConfigured(), getFallbackChain(), initRouter(), __dirname, launchTUI(), pkg

### Community 52 - "sanitize.ts"
Cohesion: 0.60
Nodes (4): maskKey(), REDACTED_KEYS, sanitizeErrorMessage(), sanitizeForLog()

## Knowledge Gaps
- **197 isolated node(s):** `session-start.sh script`, `PATH`, `name`, `version`, `description` (+192 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ignore` connect `diff.ts` to `dependencies`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `package.json`, `diff.ts`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `buildIgnoreFilter()` connect `diff.ts` to `combined.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **What connects `session-start.sh script`, `PATH`, `name` to the rest of the system?**
  _198 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `router.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07195121951219512 - nodes in this community are weakly interconnected._
- **Should `AgentName` be split into smaller, more focused modules?**
  _Cohesion score 0.14112903225806453 - nodes in this community are weakly interconnected._
- **Should `html.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06438631790744467 - nodes in this community are weakly interconnected._