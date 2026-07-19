# Graph Report - Palade  (2026-07-19)

## Corpus Check
- 168 files · ~108,860 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1021 nodes · 2592 edges · 78 communities (56 shown, 22 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e3c7f051`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- router.ts
- base.ts
- html.ts
- settings.ts
- diff.ts
- contextPacks.ts
- harness.test.ts
- useCommandRunner.ts
- types.ts
- repoContext.ts
- base.ts
- history.ts
- package.json
- types.ts
- 🤖 Palade
- markdown.ts
- Community 16
- cerebras.ts
- terminal.ts
- badge.ts
- Palade Agent Quality Diagnostic — Baseline Run
- triage.test.ts
- dependencies
- GroqProvider
- Community 24
- scripts
- createLimiter
- devDependencies
- Community 28
- calculator.ts
- [1.0.0-rc.1] - 2026-06-27
- AgentFinding
- Community 32
- Contributing to Palade
- IProvider
- Community 35
- repository
- prompt.ts
- vulnerable.ts
- Community 45
- review.ts
- Community 47
- harness.test.ts
- session-start.sh
- chunker.ts
- Commands
- Configuration: Economy Mode
- Configure a Provider
- Getting Started
- Installation
- Interactive TUI
- CodeChunk
- What is Palade?
- Community 63
- index.ts
- review.ts
- contextPacks.ts
- Community 67
- PaladeConfig
- terminal.ts
- Community 70
- badge.ts
- LiveProgress
- Community 77
- Community 91
- Community 93

## God Nodes (most connected - your core abstractions)
1. `AgentName` - 38 edges
2. `AgentFinding` - 37 edges
3. `diffCommand()` - 35 edges
4. `reviewCommand()` - 34 edges
5. `CodeChunk` - 34 edges
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
- `Conflict` --references--> `AgentFinding`  [EXTRACTED]
  src/orchestrator/verdict.ts → src/agents/base.ts
- `AppProps` --references--> `PaladeConfig`  [EXTRACTED]
  src/tui/app.tsx → src/config/schema.ts
- `ModeConfig` --references--> `AgentName`  [EXTRACTED]
  src/modes/index.ts → src/agents/base.ts

## Import Cycles
- 3-file cycle: `src/agents/custom/agent.ts -> src/agents/custom/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`
- 4-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/security.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/architecture.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/deadCode.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/logic.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/maintainability.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/performance.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/pragmatism.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/config/defaults.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/testIntelligence.ts -> src/agents/base.ts`

## Communities (78 total, 22 thin omitted)

### Community 0 - "router.ts"
Cohesion: 0.20
Nodes (11): DEFAULT_COMPLEXITY_PENALTIES, DEFAULT_CONFIG, DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS, DEFAULT_PENALTY_CAPS, DefaultConfigType, SEVERITY_PENALTY, ProviderConfigSchema, ProviderNameSchema (+3 more)

### Community 1 - "base.ts"
Cohesion: 0.22
Nodes (14): acquireLock(), appendEntry(), getPreviousScore(), isValidCategoryScore(), parseHistoryEntries(), readHistory(), releaseLock(), sleep() (+6 more)

### Community 2 - "html.ts"
Cohesion: 0.15
Nodes (25): BADGE_COLOR_HEX, buildTemplateData(), __dirname, escapeHtml(), formatDeltaText(), getScoreColor(), getScoreGradeClass(), getTemplatePath() (+17 more)

### Community 3 - "settings.ts"
Cohesion: 0.17
Nodes (17): ProviderId, PROVIDERS, quoteKeyIfNeeded(), resolveConfigPath(), saveApiKey(), saveConfigValue(), saveConfigValues(), setNestedValue() (+9 more)

### Community 4 - "diff.ts"
Cohesion: 0.08
Nodes (39): DiffContext, diffCommand(), DiffOpts, throwIfAborted(), OptionalDocResult, readOptionalProjectDoc(), addedLineRanges(), buildFingerprint() (+31 more)

### Community 5 - "contextPacks.ts"
Cohesion: 0.13
Nodes (15): scripts, build, clean, dev, format, format:check, graph:update, lint (+7 more)

### Community 6 - "harness.test.ts"
Cohesion: 0.10
Nodes (23): ALL_DEFECTS, Defect, DefectCategory, FINDING_VALIDATION_DEFECTS, MERGER_DEFECTS, realBugCount(), SCHEDULER_DEFECTS, Severity (+15 more)

### Community 7 - "useCommandRunner.ts"
Cohesion: 0.06
Nodes (47): decisionsCommand(), runTargetsAdd(), runTargetsGenerate(), runTargetsList(), runTargetsSearch(), targetsCommand, throwIfAborted(), VALUE_FLAG_STRINGS (+39 more)

### Community 8 - "types.ts"
Cohesion: 0.07
Nodes (32): ignore, loadCustomAgents(), CustomAgentDefinition, CustomAgentDefinitionSchema, AGENT_REGISTRY, getAgentsForMode(), DEBOUNCE_MS, watchCommand() (+24 more)

### Community 9 - "repoContext.ts"
Cohesion: 0.19
Nodes (13): buildPublicApi(), buildRepoContext(), candidatesFor(), collectStrings(), findCycles(), isTestFile(), renderCappedList(), renderRepoContext() (+5 more)

### Community 10 - "base.ts"
Cohesion: 0.22
Nodes (14): CompletionRequest, CompletionResponse, FATAL_QUOTA_KEYWORDS, fetchWithRetry(), isDailyLimitError(), nextRetryMaxTokens(), QUOTA_ERROR_TAG, rateLimitedMessage() (+6 more)

### Community 11 - "history.ts"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, @eslint/js, prettier, tsx, @types/node, @types/react, typescript (+2 more)

### Community 12 - "package.json"
Cohesion: 0.12
Nodes (15): author, bin, palade, bugs, url, description, engines, node (+7 more)

### Community 13 - "types.ts"
Cohesion: 0.25
Nodes (10): highestSeverity(), makeUnionFind(), SEVERITY_ORDER, isNearMatch(), jaccardSimilarity(), mergeFindings(), mergeTwo(), NearMatchOptions (+2 more)

### Community 14 - "🤖 Palade"
Cohesion: 0.05
Nodes (40): Palade Benchmark Report, Precision — mature libraries, Recall — planted vulnerabilities, Reliability — read this before trusting any single run, Reproduce, Setup, 🏆 Benchmarks, 🔁 CI/CD Integration (+32 more)

### Community 15 - "markdown.ts"
Cohesion: 0.33
Nodes (3): DEFAULT_REFERER, __dirname, OpenRouterProvider

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, jsx, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 18 - "terminal.ts"
Cohesion: 0.23
Nodes (14): scoreCommand(), BLOCKS, drawBox(), formatDelta(), formatDriftAlert(), kvTable(), scoreGrade(), sectionBox() (+6 more)

### Community 19 - "badge.ts"
Cohesion: 0.09
Nodes (20): Code Patterns to Recognize (No Detailed Read-Through Needed), Codebase Knowledge Graph (graphify) — Read This First, Common Failure Modes (Things to Watch), Configuration & Customization, Cross-Session Memory (claude-mem) — Opt-In, Entry Points & Control Flow, File Skip List (Don't Waste Tokens Reading These), graphify (+12 more)

### Community 20 - "Palade Agent Quality Diagnostic — Baseline Run"
Cohesion: 0.15
Nodes (12): Adjudication (ground truth — full repo access), Agent 1: Security, Agent 2: Architecture, Agent 3: Performance, Agent 4: Maintainability, Agent 5: Dead Code, Agent 6: Test Intelligence, Baseline Numbers (+4 more)

### Community 22 - "dependencies"
Cohesion: 0.13
Nodes (5): IProvider, FallbackProvider, markResponsibleProviderDead(), ProviderAssignment, withRoleStats()

### Community 26 - "createLimiter"
Cohesion: 0.11
Nodes (10): CerebrasProvider, CONFIG, CONFIG, GroqProvider, CONFIG, NvidiaProvider, OpenAICompatibleConfig, OpenAICompatibleProvider (+2 more)

### Community 28 - "Community 28"
Cohesion: 0.31
Nodes (13): applyLineIgnores(), ScopeOptions, PipelineOptions, runPipeline(), estimateTotalTokens(), runSwarm(), triageFiles(), ResolvedTarget (+5 more)

### Community 29 - "calculator.ts"
Cohesion: 0.07
Nodes (53): Severity, computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse(), PriorityFix, selectFindingsForSynthesis() (+45 more)

### Community 30 - "[1.0.0-rc.1] - 2026-06-27"
Cohesion: 0.25
Nodes (7): [1.0.0-rc.1] - 2026-06-27, [1.0.0-rc.2] - 2026-07-07, Added, Changed, Changelog, Fixed, Security

### Community 31 - "AgentFinding"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 32 - "Community 32"
Cohesion: 0.06
Nodes (51): AgentContext, AgentFinding, AgentName, DummyAgent, annotateComplexity(), BaseSpecialistAgent, buildChunkContext(), buildSystemPrompt() (+43 more)

### Community 33 - "Contributing to Palade"
Cohesion: 0.33
Nodes (5): Architecture and Scope, Contributing to Palade, Pull Request Process, Setting Up For Development, Testing

### Community 34 - "IProvider"
Cohesion: 0.14
Nodes (14): AuthError, tagQuotaError(), isFatalAuthError(), PoolSourceTaggedError, PROVIDER_POOL_SOURCE, agentAssignments, allProviders, createProviderInstances() (+6 more)

### Community 52 - "harness.test.ts"
Cohesion: 0.31
Nodes (10): makeHugeSingleLineChunk(), makeMinifiedChunk(), makeMixedChunk(), makeNormalChunk(), makeRelativePathChunk(), makeWindowsPathChunk(), estimateTokens(), hardSplitBudget() (+2 more)

### Community 54 - "chunker.ts"
Cohesion: 0.31
Nodes (11): calculateComplexityForNodes(), chunkByAST(), chunkByBrackets(), chunkFiles(), chunkOneFile(), getTopLevelSymbolName(), isComplexityNode(), isRegexStartAllowed() (+3 more)

### Community 61 - "CodeChunk"
Cohesion: 0.29
Nodes (8): injectContextAndSplit(), buildKeywordIndex(), getKeywordContext(), IndexedChunk, CODE_STOP_WORDS, CodeChunk, contextBlockKey(), mergeContexts()

### Community 63 - "Community 63"
Cohesion: 0.16
Nodes (13): AnnotationSummary, FILE_IGNORE_RE, FOCUS_RE, IGNORE_RE, parseFileAsync(), REVIEW_RE, stripStringLiterals(), Annotation (+5 more)

### Community 64 - "index.ts"
Cohesion: 0.30
Nodes (7): ReviewMode, DEBT_MODE, GHOST_MODE, ModeConfig, MODES, ONBOARD_MODE, SECURITY_MODE

### Community 65 - "review.ts"
Cohesion: 0.30
Nodes (10): reviewCommand(), ReviewOptions, VALID_REPORT_FORMATS, escapeRegex(), getLanguage(), resolveSymbol(), getModeConfig(), validateMode() (+2 more)

### Community 66 - "contextPacks.ts"
Cohesion: 0.38
Nodes (9): buildRetrievedContext(), expectedTestBases(), getIdentifierTerms(), identifierTerms(), identifierTermsCache, resolveRelativeImport(), scoreRelatedChunk(), toPosix() (+1 more)

### Community 67 - "Community 67"
Cohesion: 0.17
Nodes (12): dependencies, chalk, chokidar, commander, dotenv, ink, ink-spinner, ink-text-input (+4 more)

### Community 68 - "PaladeConfig"
Cohesion: 0.27
Nodes (7): PaladeConfig, EstimateResult, estimateRunCost(), getProviderModelKey(), lookupPrice(), PRICING_TABLE, scheduleBatches()

### Community 69 - "terminal.ts"
Cohesion: 0.38
Nodes (10): groupBySeverity(), formatDelta(), printDiffSummary(), renderCategoryScore(), renderFinding(), renderScoreBar(), reportTerminal(), SEVERITY_COLORS (+2 more)

### Community 70 - "Community 70"
Cohesion: 0.13
Nodes (14): readCurrentKeys(), App(), AppProps, SafeInputHandlerProps, CommandInput(), CommandInputProps, OutputLine, OutputLineItem() (+6 more)

### Community 71 - "badge.ts"
Cohesion: 0.33
Nodes (8): COLOR_MAP, escapeXml(), getBadgeData(), getScoreColor(), measureTextWidth(), renderBadge(), BadgeColor, BadgeData

### Community 77 - "Community 77"
Cohesion: 0.22
Nodes (16): initCommand(), applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand(), SettingsOptions (+8 more)

### Community 91 - "Community 91"
Cohesion: 0.25
Nodes (10): BUILTIN_NAMES, isProviderConfigured(), buildEnvConfig(), collectKeys(), expandProviderShares(), formatZodError(), loadConfig(), __dirname (+2 more)

### Community 93 - "Community 93"
Cohesion: 0.24
Nodes (7): Header(), HeaderProps, ASCII_ART, GRADIENT, BannerOptions, printBanner(), renderAscii()

## Knowledge Gaps
- **262 isolated node(s):** `session-start.sh script`, `PATH`, `name`, `version`, `description` (+257 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 67` to `types.ts`, `package.json`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Why does `ignore` connect `types.ts` to `Community 67`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **What connects `session-start.sh script`, `PATH`, `name` to the rest of the system?**
  _264 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `diff.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07908163265306123 - nodes in this community are weakly interconnected._
- **Should `contextPacks.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `harness.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09788359788359788 - nodes in this community are weakly interconnected._
- **Should `useCommandRunner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.062111801242236024 - nodes in this community are weakly interconnected._